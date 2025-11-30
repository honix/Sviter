"""
OpenRouter adapter for LLM completions.

Uses OpenAI-compatible API via OpenRouter.
"""

import json
from typing import Dict, List, Any, Optional, Callable, Awaitable, TYPE_CHECKING

from .base import LLMAdapter, CompletionResult, ConversationResult, ToolCall
from ai.client import OpenRouterClient

if TYPE_CHECKING:
    from ai.tools import WikiTool


class OpenRouterAdapter(LLMAdapter):
    """
    Adapter for OpenRouter API (OpenAI-compatible).

    Handles:
    - Tool conversion to OpenAI function format
    - System prompt as first message
    - Response parsing for tool calls
    """

    def __init__(self, api_key: str = None, model: str = None):
        """
        Initialize OpenRouter adapter.

        Args:
            api_key: OpenRouter API key (optional, uses default)
            model: Model name (optional, uses default)
        """
        kwargs = {}
        if api_key:
            kwargs['api_key'] = api_key
        if model:
            kwargs['model'] = model
        self.client = OpenRouterClient(**kwargs)

    def _convert_tools(self, tools: List['WikiTool']) -> List[Dict[str, Any]]:
        """Convert WikiTool list to OpenAI function format"""
        return [{
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters
            }
        } for t in tools]

    def create_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: List['WikiTool'],
        system_prompt: str
    ) -> CompletionResult:
        """
        Create completion via OpenRouter API.

        System prompt is prepended to messages.
        """
        # Build full message list with system prompt first
        full_messages = [{"role": "system", "content": system_prompt}] + messages

        # Convert tools to OpenAI format
        openai_tools = self._convert_tools(tools) if tools else None

        # Make API call
        completion = self.client.create_completion(full_messages, openai_tools)
        message = completion.choices[0].message

        # Parse tool calls
        tool_calls = []
        if message.tool_calls:
            for tc in message.tool_calls:
                try:
                    args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                except json.JSONDecodeError:
                    args = {}
                tool_calls.append(ToolCall(
                    id=tc.id,
                    name=tc.function.name,
                    arguments=args
                ))

        # Determine stop reason
        stop_reason = "tool_use" if tool_calls else "end_turn"

        return CompletionResult(
            stop_reason=stop_reason,
            content=message.content or "",
            tool_calls=tool_calls,
            raw_message=message
        )

    def format_tool_result(self, tool_call_id: str, result: str) -> Dict[str, Any]:
        """Format tool result for OpenAI message format"""
        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": result
        }

    def format_assistant_message(self, result: CompletionResult) -> Dict[str, Any]:
        """Format assistant message for conversation history"""
        # For OpenAI format, we can use the raw message directly
        # as it's already in the correct format
        return result.raw_message

    async def process_conversation(
        self,
        user_message: str,
        conversation_history: List[Dict[str, Any]],
        tools: List['WikiTool'],
        max_turns: int = 20,
        on_message: Optional[Callable[[str, str], Awaitable[None]]] = None,
        on_tool_call: Optional[Callable[[Dict], Awaitable[None]]] = None,
    ) -> ConversationResult:
        """
        Process conversation with internal loop (matches Claude SDK behavior).

        Loop continues until:
        - Model responds without tool calls (natural completion)
        - max_turns is reached
        """
        # Add user message to history
        conversation_history.append({"role": "user", "content": user_message})

        openai_tools = self._convert_tools(tools)
        iteration = 0

        # Get system prompt from history (first system message)
        system_prompt = ""
        non_system_messages = []
        for msg in conversation_history:
            if isinstance(msg, dict) and msg.get("role") == "system":
                system_prompt = msg.get("content", "")
            else:
                non_system_messages.append(msg)

        while iteration < max_turns:
            iteration += 1

            # Make completion call
            full_messages = [{"role": "system", "content": system_prompt}] + non_system_messages
            completion = self.client.create_completion(full_messages, openai_tools)

            message = completion.choices[0].message
            content = message.content or ""
            tool_calls_raw = message.tool_calls or []

            # Add assistant message to history
            non_system_messages.append(message)

            # Stream message content if callback provided
            if content and on_message:
                await on_message("assistant", content)

            # No tool calls = natural completion (model is done)
            if not tool_calls_raw:
                return ConversationResult(
                    status='completed',
                    stop_reason='natural_completion',
                    iterations=iteration,
                    final_response=content
                )

            # Execute tool calls
            for tc in tool_calls_raw:
                tool_name = tc.function.name
                # Sanitize tool name (remove garbage after actual name)
                if '<' in tool_name:
                    tool_name = tool_name.split('<')[0]
                tool_name = tool_name.strip()

                try:
                    tool_args = json.loads(tc.function.arguments) if tc.function.arguments else {}
                except json.JSONDecodeError:
                    tool_args = {}

                # Find and execute tool
                tool_def = next((t for t in tools if t.name == tool_name), None)
                if tool_def:
                    result = tool_def.function(tool_args)
                else:
                    result = f"Error: Unknown tool '{tool_name}'"

                # Stream tool call if callback provided
                if on_tool_call:
                    await on_tool_call({
                        "tool_name": tool_name,
                        "arguments": tool_args,
                        "result": result,
                        "iteration": iteration
                    })

                # Add tool result to history
                non_system_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": str(result)
                })

        # Reached max turns
        return ConversationResult(
            status='completed',
            stop_reason='max_turns',
            iterations=iteration,
            final_response=content if 'content' in dir() else ""
        )
