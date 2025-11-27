"""
Unified execution engine for both chat and autonomous agents.
Merges ChatHandler and AgentExecutor into a single, flexible system.
"""
import time
import json
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable, Union, Awaitable
from storage.git_wiki import GitWiki
from ai.client import OpenRouterClient
from ai.tools import get_wiki_tools, WikiTools
from .base import BaseAgent
from .chat_agent import ChatAgent
from .loop_controller import AgentLoopController
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

    Modes:
    - human_in_loop=True: Interactive chat mode, waits for user input
    - human_in_loop=False: Autonomous agent mode, runs to completion

    Features:
    - Optional branch creation (for PR workflow)
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
        self.loop_controller: Optional[AgentLoopController] = None
        self.start_time: float = 0
        self.iteration_count: int = 0
        self.current_model: str = BaseAgent.get_model()

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
                           human_in_loop: bool = False,
                           create_branch: bool = True,
                           on_message: Union[Callable[[str, str], None], Callable[[str, str], Awaitable[None]]] = None,
                           on_tool_call: Union[Callable[[Dict], None], Callable[[Dict], Awaitable[None]]] = None) -> Dict[str, Any]:
        """
        Start a new agent session.

        Args:
            agent_class: Agent class to execute (required - use ChatAgent for chat mode)
            system_prompt: Custom system prompt (optional, overrides agent prompt)
            human_in_loop: If True, waits for user input between iterations
            create_branch: If True, creates a PR branch for changes
            on_message: Callback for streaming messages (type, content)
            on_tool_call: Callback for streaming tool calls

        Returns:
            Session info dict
        """
        self.start_time = time.time()
        self.iteration_count = 0
        self.on_message = on_message
        self.on_tool_call = on_tool_call

        logs = []
        branch_created = None

        try:
            # Get agent configuration
            agent_name = agent_class.get_name()
            agent_prompt = system_prompt or agent_class.get_prompt()
            self.current_model = agent_class.get_model()

            # Check if agent is enabled
            if not agent_class.is_enabled():
                return {
                    "success": False,
                    "error": "Agent is disabled",
                    "agent_name": agent_name
                }

            logs.append(f"Starting session: {agent_name}")

            # Create branch if requested (and not human-in-loop)
            if create_branch and not human_in_loop:
                timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                branch_name = f"{agent_class.get_branch_prefix()}{timestamp}"

                logs.append(f"Creating branch: {branch_name}")
                self.wiki.create_branch(branch_name, from_branch=GlobalAgentConfig.default_base_branch, checkout=True)
                branch_created = branch_name

            # Initialize conversation with system prompt
            self.conversation_history = [{
                "role": "system",
                "content": agent_prompt
            }]

            # Initialize loop controller
            self.loop_controller = AgentLoopController({
                'max_iterations': GlobalAgentConfig.max_iterations,
                'max_tools_per_iteration': GlobalAgentConfig.max_tools_per_iteration,
                'timeout_seconds': GlobalAgentConfig.timeout_seconds,
            })

            # Stream system prompt if callback provided
            await self._call_callback(self.on_message, "system_prompt", agent_prompt)

            # For autonomous agents, add initial "Begin" message
            if not human_in_loop:
                self.conversation_history.append({
                    "role": "user",
                    "content": "Begin your analysis."
                })

            return {
                "success": True,
                "agent_name": agent_name,
                "branch_created": branch_created,
                "human_in_loop": human_in_loop,
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
        Process one turn of conversation (one or more AI iterations until stopped or waiting for input).

        Args:
            user_message: User's message (required for human_in_loop mode)

        Returns:
            ExecutionResult with status
        """
        logs = []

        try:
            # Add user message to conversation if provided
            if user_message:
                self.conversation_history.append({
                    "role": "user",
                    "content": user_message
                })
                logs.append(f"User: {user_message[:100]}...")

            # Initialize AI client with current session's model
            client = OpenRouterClient(api_key=self.api_key, model=self.current_model)

            # Get wiki tools
            wiki_tools = get_wiki_tools(self.wiki)
            openai_tools = self._convert_tools_to_openai_format(wiki_tools)

            # Process loop - continue until stopped by loop control
            while True:
                self.iteration_count += 1
                logs.append(f"Iteration {self.iteration_count}")

                # Get AI response
                completion = client.create_completion(
                    messages=self.conversation_history,
                    tools=openai_tools
                )

                message = completion.choices[0].message
                message_content = message.content or ""
                tool_calls_raw = message.tool_calls if message.tool_calls else []

                # Add assistant message to conversation
                self.conversation_history.append(message)

                # Stream AI message if callback provided
                if message_content:
                    await self._call_callback(self.on_message, "assistant", message_content)

                logs.append(f"AI: {message_content[:100]}...")

                # Convert tool calls for loop control
                tool_calls_for_control = [
                    {"name": tc.function.name, "arguments": json.loads(tc.function.arguments) if tc.function.arguments else {}}
                    for tc in tool_calls_raw
                ] if tool_calls_raw else []

                # Check loop control
                should_continue, stop_reason = self.loop_controller.should_continue(
                    self.iteration_count, tool_calls_for_control, message_content
                )

                if not should_continue:
                    logs.append(f"Stopping: {stop_reason}")

                    # Get stats
                    stats = self.loop_controller.get_stats()

                    return ExecutionResult(
                        agent_name="agent",  # Will be set by caller
                        status='completed',
                        stop_reason=stop_reason,
                        iterations=self.iteration_count,
                        pages_analyzed=stats['pages_analyzed'],
                        execution_time=time.time() - self.start_time,
                        logs=logs,
                        final_response=message_content
                    )

                # Process tool calls
                if tool_calls_raw:
                    logs.append(f"Executing {len(tool_calls_raw)} tool calls")

                    for tool_call in tool_calls_raw:
                        tool_name = tool_call.function.name

                        # Sanitize tool name
                        if '<' in tool_name:
                            tool_name = tool_name.split('<')[0]
                        tool_name = tool_name.strip()

                        tool_args = json.loads(tool_call.function.arguments) if tool_call.function.arguments else {}

                        # Execute tool
                        result = self._execute_tool(tool_name, tool_args, wiki_tools)

                        # Stream tool call if callback provided
                        await self._call_callback(self.on_tool_call, {
                            "tool_name": tool_name,
                            "arguments": tool_args,
                            "result": result,
                            "iteration": self.iteration_count
                        })

                        # Track in loop controller
                        if tool_name == 'read_page':
                            self.loop_controller.record_page_analyzed(tool_args.get('title', ''))
                        elif tool_name == 'edit_page':
                            self.loop_controller.record_change(tool_args)

                        # Add tool result to conversation
                        self.conversation_history.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": str(result)
                        })

                    # Continue loop to let AI respond to tool results
                    continue

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

    def _execute_tool(self, tool_name: str, tool_args: Dict[str, Any], tools: List[Dict]) -> Any:
        """Execute a tool by name"""
        tool_def = next((t for t in tools if t['name'] == tool_name), None)

        if not tool_def:
            raise ValueError(f"Tool '{tool_name}' not found")

        tool_function = tool_def.get('function')
        if not tool_function:
            raise ValueError(f"Tool '{tool_name}' has no function")

        return tool_function(**tool_args)

    def _convert_tools_to_openai_format(self, wiki_tools: List[Dict]) -> List[Dict]:
        """Convert wiki tools to OpenAI function calling format"""
        openai_tools = []
        for tool in wiki_tools:
            openai_tools.append({
                "type": "function",
                "function": {
                    "name": tool['name'],
                    "description": tool['description'],
                    "parameters": tool['parameters']
                }
            })
        return openai_tools

    def get_conversation_history(self) -> List[Dict[str, Any]]:
        """Get current conversation history"""
        return self.conversation_history.copy()

    def reset_conversation(self):
        """Reset conversation to initial state"""
        self.conversation_history = []
        self.loop_controller = None
        self.iteration_count = 0
        self.current_model = BaseAgent.get_model()  # Reset to default

    def end_session(self, reset_branch: bool = False):
        """
        End the session and clean up.

        Args:
            reset_branch: If True, switch back to main branch. Default is False to preserve
                         user's branch selection. Only set to True after agent execution.
        """
        if reset_branch:
            try:
                # Switch back to main branch if we're not already on it
                current_branch = self.wiki.get_current_branch()
                if current_branch != GlobalAgentConfig.default_base_branch:
                    self.wiki.checkout_branch(GlobalAgentConfig.default_base_branch)
            except Exception as e:
                print(f"Warning: Failed to switch back to main branch: {e}")
