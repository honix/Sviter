"""
Agent executor - runs autonomous agents with loop control.
"""
import time
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from storage.git_wiki import GitWiki, GitWikiException
from ai.client import OpenRouterClient
from ai.tools import get_wiki_tools
from .base import BaseAgent
from .loop_controller import AgentLoopController
from .config import GlobalAgentConfig


class ExecutionResult:
    """Result of an agent execution"""

    def __init__(self, agent_name: str, status: str, stop_reason: str,
                 iterations: int, branch_created: Optional[str] = None,
                 pages_analyzed: int = 0, execution_time: float = 0,
                 logs: List[str] = None, error: Optional[str] = None):
        self.agent_name = agent_name
        self.status = status  # 'completed', 'stopped', 'error'
        self.stop_reason = stop_reason
        self.iterations = iterations
        self.branch_created = branch_created
        self.pages_analyzed = pages_analyzed
        self.execution_time = execution_time
        self.logs = logs or []
        self.error = error

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
            "error": self.error
        }


class AgentExecutor:
    """
    Executes individual agent runs with proper isolation and control.
    """

    def __init__(self, wiki: GitWiki, api_key: str):
        """
        Initialize agent executor.

        Args:
            wiki: GitWiki instance
            api_key: OpenRouter API key
        """
        self.wiki = wiki
        self.api_key = api_key

    def execute(self, agent_class: type[BaseAgent]) -> ExecutionResult:
        """
        Execute an agent class with full loop control.

        Args:
            agent_class: Agent class to execute

        Returns:
            ExecutionResult
        """
        start_time = time.time()
        logs = []
        branch_created = None
        error = None

        try:
            # Verify agent is enabled
            if not agent_class.is_enabled():
                return ExecutionResult(
                    agent_name=agent_class.get_name(),
                    status='skipped',
                    stop_reason='agent_disabled',
                    iterations=0,
                    execution_time=0,
                    logs=["Agent is disabled"]
                )

            logs.append(f"Starting agent: {agent_class.get_name()}")

            # Create branch for agent work
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            branch_name = f"{agent_class.get_branch_prefix()}{timestamp}"

            logs.append(f"Creating branch: {branch_name}")
            self.wiki.create_branch(branch_name, from_branch=GlobalAgentConfig.default_base_branch, checkout=True)
            branch_created = branch_name

            # Initialize AI client with agent's model
            client = OpenRouterClient(api_key=self.api_key, model=agent_class.get_model())

            # Get wiki tools - convert to OpenAI format
            wiki_tools = get_wiki_tools(self.wiki)
            openai_tools = self._convert_tools_to_openai_format(wiki_tools)

            # Initialize loop controller
            loop_controller = AgentLoopController({
                'max_iterations': GlobalAgentConfig.max_iterations,
                'max_tools_per_iteration': GlobalAgentConfig.max_tools_per_iteration,
                'timeout_seconds': GlobalAgentConfig.timeout_seconds,
            })

            # Build conversation history
            conversation_history = [{
                "role": "system",
                "content": agent_class.get_prompt()
            }, {
                "role": "user",
                "content": "Begin your analysis."
            }]

            # Execute agent loop
            iteration = 0
            stop_reason = "unknown"

            logs.append("Entering agent loop")

            while True:
                iteration += 1
                logs.append(f"Iteration {iteration}")

                # Get AI response using OpenRouterClient
                completion = client.create_completion(
                    messages=conversation_history,
                    tools=openai_tools
                )

                message = completion.choices[0].message

                # Extract tool calls and content
                tool_calls_raw = message.tool_calls if message.tool_calls else []
                message_content = message.content or ""

                # Add assistant response to history
                conversation_history.append(message)

                logs.append(f"AI response: {message_content[:100]}...")
                if tool_calls_raw:
                    logs.append(f"Tool calls: {len(tool_calls_raw)}")

                # Convert tool calls to format for loop control
                tool_calls_for_control = [
                    {"name": tc.function.name, "arguments": json.loads(tc.function.arguments) if tc.function.arguments else {}}
                    for tc in tool_calls_raw
                ] if tool_calls_raw else []

                # Check loop control
                should_continue, stop_reason = loop_controller.should_continue(
                    iteration, tool_calls_for_control, message_content
                )

                if not should_continue:
                    logs.append(f"Stopping: {stop_reason}")
                    break

                # Process tool calls
                if tool_calls_raw:
                    for tool_call in tool_calls_raw:
                        tool_name = tool_call.function.name
                        # Sanitize tool name (remove any garbage after the actual name)
                        if '<' in tool_name:
                            tool_name = tool_name.split('<')[0]
                        tool_name = tool_name.strip()

                        tool_args = json.loads(tool_call.function.arguments) if tool_call.function.arguments else {}

                        logs.append(f"Executing tool: {tool_name}({tool_args})")

                        # Execute tool
                        result = self._execute_tool(tool_name, tool_args, wiki_tools)

                        # Track in loop controller
                        if tool_name == 'read_page':
                            loop_controller.record_page_analyzed(tool_args.get('title', ''))
                        elif tool_name == 'edit_page':
                            loop_controller.record_change(tool_args)

                        # Add tool result to conversation
                        conversation_history.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": str(result)
                        })

            # After loop: check if changes were made
            stats = loop_controller.get_stats()

            # If no changes were made, delete the empty branch
            # If changes were made, stay on the agent branch for review
            if stats['changes_made'] == 0 and branch_created:
                logs.append(f"No changes made, cleaning up branch: {branch_created}")
                try:
                    # Must checkout main first - can't delete current branch
                    self.wiki.checkout_branch(GlobalAgentConfig.default_base_branch)
                    self.wiki.delete_branch(branch_created)
                except Exception as e:
                    logs.append(f"Warning: Failed to delete empty branch: {e}")
            else:
                logs.append(f"Changes made, staying on branch: {branch_created}")

            # Success
            execution_time = time.time() - start_time
            logs.append(f"Completed in {execution_time:.2f}s")

            return ExecutionResult(
                agent_name=agent_class.get_name(),
                status='completed' if stop_reason in ['natural_completion', 'explicit_completion_signal'] else 'stopped',
                stop_reason=stop_reason,
                iterations=iteration,
                branch_created=branch_created if stats['changes_made'] > 0 else None,
                pages_analyzed=stats['pages_analyzed'],
                execution_time=execution_time,
                logs=logs
            )

        except Exception as e:
            # Error occurred
            error = str(e)
            logs.append(f"ERROR: {error}")

            # Clean up the branch on error
            if branch_created:
                try:
                    self.wiki.delete_branch(branch_created)
                    logs.append(f"Cleaned up branch after error: {branch_created}")
                except:
                    pass

            return ExecutionResult(
                agent_name=agent_class.get_name() if agent_class else "unknown",
                status='error',
                stop_reason='exception',
                iterations=iteration if 'iteration' in locals() else 0,
                branch_created=branch_created,
                execution_time=time.time() - start_time,
                logs=logs,
                error=error
            )

    def _execute_tool(self, tool_name: str, tool_args: Dict[str, Any], tools: List[Dict]) -> Any:
        """
        Execute a tool by name.

        Args:
            tool_name: Name of the tool
            tool_args: Tool arguments
            tools: List of available tools

        Returns:
            Tool result
        """
        # Find tool definition
        tool_def = next((t for t in tools if t['name'] == tool_name), None)

        if not tool_def:
            raise ValueError(f"Tool '{tool_name}' not found")

        # Execute tool function
        tool_function = tool_def.get('function')
        if not tool_function:
            raise ValueError(f"Tool '{tool_name}' has no function")

        return tool_function(**tool_args)

    def _convert_tools_to_openai_format(self, wiki_tools: List[Dict]) -> List[Dict]:
        """
        Convert wiki tools to OpenAI function calling format.

        Args:
            wiki_tools: List of wiki tool definitions

        Returns:
            List of OpenAI-formatted tool definitions
        """
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
