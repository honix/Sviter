"""
Execution engine for chat and autonomous agents.

Pass system_prompt, model, provider, human_in_loop to start_session.
"""
import time
import asyncio
from typing import Dict, Any, List, Optional, Callable, Union, Awaitable
from storage.git_wiki import GitWiki
from ai.tools import WikiTool, ToolBuilder
from ai.adapters import OpenRouterAdapter, LLMAdapter
from ai.adapters.claude_sdk import ClaudeSDKAdapter, CLAUDE_SDK_AVAILABLE
from .config import GlobalAgentConfig


class ExecutionResult:
    """Result of an agent execution (both chat and autonomous)"""

    def __init__(self, agent_name: str, status: str, stop_reason: str,
                 iterations: int, branch_created: Optional[str] = None,
                 pages_analyzed: int = 0, execution_time: float = 0,
                 logs: List[str] = None, error: Optional[str] = None,
                 final_response: str = ""):
        self.agent_name = agent_name
        self.status = status  # 'completed', 'stopped', 'error', 'waiting_for_input'
        self.stop_reason = stop_reason
        self.iterations = iterations
        self.branch_created = branch_created
        self.pages_analyzed = pages_analyzed
        self.execution_time = execution_time
        self.logs = logs or []
        self.error = error
        self.final_response = final_response

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "agent_name": self.agent_name,
            "status": self.status,
            "stop_reason": self.stop_reason,
            "iterations": self.iterations,
            "branch_created": self.branch_created,
            "pages_analyzed": self.pages_analyzed,
            "execution_time": self.execution_time,
            "logs": self.logs,
            "error": self.error,
            "final_response": self.final_response
        }


class AgentExecutor:
    """
    Execution engine for chat and autonomous agents.

    Features:
    - WebSocket streaming support via callbacks
    - Loop control for all modes
    - Conversation history management
    """

    def __init__(self, wiki: GitWiki, api_key: str = None):
        """
        Initialize unified executor.

        Args:
            wiki: GitWiki instance
            api_key: OpenRouter API key (optional, uses default if not provided)
        """
        self.wiki = wiki
        self.api_key = api_key
        self.conversation_history: List[Dict[str, Any]] = []
        self.adapter: Optional[LLMAdapter] = None
        self.start_time: float = 0
        self.iteration_count: int = 0
        self.current_model: str = "anthropic/claude-sonnet-4"
        self.current_provider: str = "openrouter"  # "openrouter" or "claude"
        self.current_agent_class: Optional[type] = None  # Legacy: agent class
        self.current_agent_name: str = "agent"  # Name for results
        self.branch_created: Optional[str] = None
        self.human_in_loop: bool = True
        self.on_start_called: bool = False

    async def _call_callback(self, callback: Optional[Callable], *args, **kwargs):
        """Helper to call sync or async callbacks"""
        if callback is None:
            return
        if asyncio.iscoroutinefunction(callback):
            await callback(*args, **kwargs)
        else:
            callback(*args, **kwargs)

    async def start_session(self,
                           agent_class: Optional[type] = None,  # Deprecated: use config dict instead
                           system_prompt: str = None,
                           on_message: Union[Callable[[str, str], None], Callable[[str, str], Awaitable[None]]] = None,
                           on_tool_call: Union[Callable[[Dict], None], Callable[[Dict], Awaitable[None]]] = None,
                           on_branch_created: Union[Callable[[str], None], Callable[[str], Awaitable[None]]] = None,
                           # Config dict parameters (preferred over agent_class)
                           model: str = None,
                           provider: str = None,
                           human_in_loop: bool = None,
                           agent_name: str = None) -> Dict[str, Any]:
        """
        Start a new agent session.

        Two configuration modes:
        1. Config dict (preferred): Pass model, provider, human_in_loop, system_prompt directly
        2. Legacy agent class: Pass agent_class for backward compatibility

        Args:
            agent_class: (Legacy) Agent class to execute
            system_prompt: System prompt for the agent (required if no agent_class)
            on_message: Callback for streaming messages (type, content)
            on_tool_call: Callback for streaming tool calls
            on_branch_created: Callback when branch is created
            model: Model to use (e.g., 'claude-sonnet-4-5')
            provider: Provider ('claude' or 'openrouter')
            human_in_loop: If True, waits for user input between turns
            agent_name: Name for logging/results

        Returns:
            Session info dict
        """
        self.start_time = time.time()
        self.iteration_count = 0
        self.on_message = on_message
        self.on_tool_call = on_tool_call
        self.on_branch_created = on_branch_created
        self.current_agent_class = agent_class
        self.branch_created = None

        logs = []

        try:
            # Determine configuration source
            if agent_class is not None:
                # Legacy mode: extract from agent class
                self.current_agent_name = agent_class.get_name()
                agent_prompt = system_prompt or agent_class.get_prompt()
                self.current_model = agent_class.get_model()
                self.current_provider = agent_class.get_provider()
                self.human_in_loop = agent_class.human_in_loop

                # Check if agent is enabled
                if not agent_class.is_enabled():
                    return {
                        "success": False,
                        "error": "Agent is disabled",
                        "agent_name": self.current_agent_name
                    }
            else:
                # Config dict mode: use direct parameters
                if not system_prompt:
                    return {
                        "success": False,
                        "error": "system_prompt is required when not using agent_class"
                    }

                self.current_agent_name = agent_name or "agent"
                agent_prompt = system_prompt
                self.current_model = model or "claude-sonnet-4-5"
                self.current_provider = provider or "claude"
                self.human_in_loop = human_in_loop if human_in_loop is not None else True

            logs.append(f"Starting session: {self.current_agent_name}")
            logs.append(f"Mode: {'interactive' if self.human_in_loop else 'autonomous'}")
            logs.append(f"Provider: {self.current_provider}, Model: {self.current_model}")

            # Reset on_start flag - will be called on first process_turn
            self.on_start_called = False

            # Initialize conversation with system prompt
            self.conversation_history = [{
                "role": "system",
                "content": agent_prompt
            }]

            # Create adapter based on provider
            if self.current_provider == "claude":
                if not CLAUDE_SDK_AVAILABLE:
                    return {
                        "success": False,
                        "error": "Claude SDK not available. Install with: pip install claude-agent-sdk",
                        "agent_name": agent_name
                    }
                self.adapter = ClaudeSDKAdapter(
                    system_prompt=agent_prompt,
                    model=self.current_model
                )
            else:
                self.adapter = OpenRouterAdapter(
                    api_key=self.api_key,
                    model=self.current_model
                )

            # Stream system prompt if callback provided
            await self._call_callback(self.on_message, "system_prompt", agent_prompt)

            # For autonomous agents, add initial "Begin" message
            if not self.human_in_loop:
                self.conversation_history.append({
                    "role": "user",
                    "content": "Begin your analysis."
                })

            return {
                "success": True,
                "agent_name": self.current_agent_name,
                "human_in_loop": self.human_in_loop,
                "logs": logs
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "logs": logs
            }

    async def process_turn(self, user_message: str = None, custom_tools: List[WikiTool] = None) -> ExecutionResult:
        """
        Process one turn of conversation.

        The adapter handles the conversation loop internally:
        - OpenRouter: Loops until no tool calls or max_turns
        - Claude SDK: SDK manages the loop internally

        Args:
            user_message: User's message (required for human_in_loop mode)
            custom_tools: Optional list of custom tools to use instead of default wiki tools

        Returns:
            ExecutionResult with status
        """
        logs = []

        try:
            # Call on_start on first turn (creates branch for AgentOnBranch)
            if not self.on_start_called and self.current_agent_class:
                self.on_start_called = True
                self.branch_created = self.current_agent_class.on_start(self.wiki)
                if self.branch_created:
                    logs.append(f"Created branch: {self.branch_created}")
                    await self._call_callback(self.on_branch_created, self.branch_created)

            # Get tools - use custom tools if provided, otherwise default read+edit tools
            wiki_tools = custom_tools if custom_tools is not None else (
                ToolBuilder.wiki_read_tools(self.wiki) + ToolBuilder.wiki_edit_tools(self.wiki)
            )

            logs.append(f"Processing with {self.current_provider} adapter")

            # Use adapter's process_conversation - handles loop internally
            result = await self.adapter.process_conversation(
                user_message=user_message or "Begin.",
                conversation_history=self.conversation_history,
                tools=wiki_tools,
                max_turns=GlobalAgentConfig.max_iterations,
                on_message=lambda t, c: self._call_callback(self.on_message, t, c),
                on_tool_call=lambda d: self._call_callback(self.on_tool_call, d),
            )

            self.iteration_count += result.iterations
            logs.append(f"Completed: {result.stop_reason} after {result.iterations} iterations")

            return ExecutionResult(
                agent_name=self.current_agent_name,
                status=result.status,
                stop_reason=result.stop_reason,
                iterations=result.iterations,
                execution_time=time.time() - self.start_time,
                logs=logs,
                final_response=result.final_response,
                error=result.error
            )

        except Exception as e:
            return ExecutionResult(
                agent_name=self.current_agent_name,
                status='error',
                stop_reason='exception',
                iterations=self.iteration_count,
                execution_time=time.time() - self.start_time,
                logs=logs,
                error=str(e)
            )

    def get_conversation_history(self) -> List[Dict[str, Any]]:
        """Get current conversation history"""
        return self.conversation_history.copy()

    def reset_conversation(self):
        """Reset conversation to initial state"""
        self.conversation_history = []
        self.adapter = None
        self.iteration_count = 0
        self.current_model = "anthropic/claude-sonnet-4"
        self.current_provider = "openrouter"
        self.current_agent_class = None
        self.current_agent_name = "agent"
        self.branch_created = None
        self.human_in_loop = True
        self.on_start_called = False

    def end_session(self, call_on_finish: bool = True) -> Dict[str, Any]:
        """
        End the session and clean up.

        Calls the agent's on_finish lifecycle hook which handles:
        - Deleting empty branches (no changes made)
        - Keeping branches with changes for PR review

        Args:
            call_on_finish: If True, call agent's on_finish hook

        Returns:
            Dict with cleanup info:
            - branch_deleted: Name of deleted branch (if any)
            - switched_to_branch: Branch switched to after cleanup (if any)
        """
        cleanup_info = {
            "branch_deleted": None,
            "switched_to_branch": None
        }

        if call_on_finish and self.current_agent_class:
            try:
                # Check if changes were made by looking at git diff
                changes_made = 0
                if self.branch_created:
                    try:
                        diff = self.wiki.get_diff(GlobalAgentConfig.default_base_branch, self.branch_created)
                        changes_made = 1 if diff.strip() else 0
                    except Exception:
                        changes_made = 0

                # Track if branch will be deleted (no changes made)
                if changes_made == 0 and self.branch_created:
                    cleanup_info["branch_deleted"] = self.branch_created
                    cleanup_info["switched_to_branch"] = GlobalAgentConfig.default_base_branch

                # Call agent's on_finish lifecycle hook
                self.current_agent_class.on_finish(
                    self.wiki,
                    self.branch_created,
                    changes_made
                )
            except Exception as e:
                print(f"Warning: on_finish failed: {e}")

        return cleanup_info
