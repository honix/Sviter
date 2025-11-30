"""
Unified execution engine for both chat and autonomous agents.
Merges ChatHandler and AgentExecutor into a single, flexible system.
"""
import time
import asyncio
from typing import Dict, Any, List, Optional, Callable, Union, Awaitable
from storage.git_wiki import GitWiki
from ai.tools import get_wiki_tools, WikiTool
from ai.adapters import OpenRouterAdapter, LLMAdapter
from ai.adapters.claude_sdk import ClaudeSDKAdapter, CLAUDE_SDK_AVAILABLE
from .base import BaseAgent
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


class UnifiedAgentExecutor:
    """
    Unified execution engine for both chat (human-in-the-loop) and autonomous agents.

    Execution mode is determined by agent class properties:
    - agent.human_in_loop: If True, waits for user input between iterations
    - agent.create_branch: If True, creates a PR branch for changes

    Lifecycle hooks:
    - agent.on_start(wiki): Called before execution, can create branch
    - agent.on_finish(wiki, branch, changes_made): Called after execution

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
        self.current_model: str = BaseAgent.get_model()
        self.current_provider: str = "openrouter"  # "openrouter" or "claude"
        self.current_agent_class: Optional[type[BaseAgent]] = None
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
                           agent_class: type[BaseAgent],
                           system_prompt: str = None,
                           on_message: Union[Callable[[str, str], None], Callable[[str, str], Awaitable[None]]] = None,
                           on_tool_call: Union[Callable[[Dict], None], Callable[[Dict], Awaitable[None]]] = None,
                           on_branch_created: Union[Callable[[str], None], Callable[[str], Awaitable[None]]] = None) -> Dict[str, Any]:
        """
        Start a new agent session.

        Execution mode is determined by agent class properties:
        - agent_class.human_in_loop: If True, waits for user input
        - agent_class.create_branch: If True, creates a PR branch

        Args:
            agent_class: Agent class to execute (required - use ChatAgent for chat mode)
            system_prompt: Custom system prompt (optional, overrides agent prompt)
            on_message: Callback for streaming messages (type, content)
            on_tool_call: Callback for streaming tool calls

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

        # Get execution mode from agent class
        self.human_in_loop = agent_class.human_in_loop

        logs = []

        try:
            # Get agent configuration
            agent_name = agent_class.get_name()
            agent_prompt = system_prompt or agent_class.get_prompt()
            self.current_model = agent_class.get_model()
            self.current_provider = agent_class.get_provider()

            # Check if agent is enabled
            if not agent_class.is_enabled():
                return {
                    "success": False,
                    "error": "Agent is disabled",
                    "agent_name": agent_name
                }

            logs.append(f"Starting session: {agent_name}")
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
                "agent_name": agent_name,
                "human_in_loop": self.human_in_loop,
                "logs": logs
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "logs": logs
            }

    async def process_turn(self, user_message: str = None) -> ExecutionResult:
        """
        Process one turn of conversation.

        The adapter handles the conversation loop internally:
        - OpenRouter: Loops until no tool calls or max_turns
        - Claude SDK: SDK manages the loop internally

        Args:
            user_message: User's message (required for human_in_loop mode)

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

            # Get wiki tools
            wiki_tools = get_wiki_tools(self.wiki)

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
                agent_name=self.current_agent_class.get_name() if self.current_agent_class else "agent",
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
                agent_name="agent",
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
        self.current_model = BaseAgent.get_model()  # Reset to default
        self.current_provider = "openrouter"
        self.current_agent_class = None
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
