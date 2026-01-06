"""
Base classes for LLM adapters.

Provides abstract interface that all LLM providers must implement.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Callable, Awaitable, TYPE_CHECKING

import os

if TYPE_CHECKING:
    from ai.tools import WikiTool


# Default context limit from env, fallback to 200k
CONTEXT_LIMIT = int(os.environ.get("CONTEXT_LIMIT", 200000))


@dataclass
class UsageData:
    """Token usage data from LLM completion"""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    context_limit: int = CONTEXT_LIMIT

    @property
    def context_percent(self) -> float:
        """Percentage of context window used by prompt tokens"""
        if self.context_limit == 0:
            return 0.0
        return (self.prompt_tokens / self.context_limit) * 100


@dataclass
class ConversationResult:
    """Result of a full conversation turn (may include multiple iterations)"""
    status: str  # 'completed', 'error'
    stop_reason: str  # 'natural_completion', 'max_turns', 'exception'
    iterations: int
    final_response: str
    error: Optional[str] = None
    usage: Optional[UsageData] = None  # Aggregated usage across iterations


@dataclass
class ToolCall:
    """Represents a tool call from the LLM"""
    id: str
    name: str
    arguments: Dict[str, Any]


@dataclass
class CompletionResult:
    """
    Unified completion result from any LLM provider.

    Abstracts away provider-specific response formats.
    """
    stop_reason: str  # "end_turn" | "tool_use" | "max_tokens" | "error"
    content: str  # Text content from the response
    tool_calls: List[ToolCall] = field(default_factory=list)
    raw_message: Any = None  # Original message for conversation history
    usage: Optional[UsageData] = None  # Token usage for this completion


class LLMAdapter(ABC):
    """
    Abstract base class for LLM adapters.

    Each adapter handles provider-specific:
    - Message format conversion
    - Tool format conversion
    - API communication
    - Response parsing
    """

    @abstractmethod
    def create_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: List['WikiTool'],
        system_prompt: str
    ) -> CompletionResult:
        """
        Create a completion with the LLM.

        Args:
            messages: Conversation history (role/content dicts)
            tools: List of WikiTool objects to make available
            system_prompt: System prompt to use

        Returns:
            CompletionResult with response content and any tool calls
        """
        pass

    @abstractmethod
    def format_tool_result(self, tool_call_id: str, result: str) -> Dict[str, Any]:
        """
        Format a tool result for this provider's message format.

        Args:
            tool_call_id: ID of the tool call this is a result for
            result: String result from the tool execution

        Returns:
            Dict in the format expected by this provider
        """
        pass

    @abstractmethod
    def format_assistant_message(self, result: CompletionResult) -> Dict[str, Any]:
        """
        Format an assistant message for conversation history.

        Args:
            result: CompletionResult from a completion call

        Returns:
            Dict in the format expected by this provider
        """
        pass

    def execute_tool(self, tool_call: ToolCall, tools: List['WikiTool']) -> str:
        """
        Execute a tool call and return the result.

        Args:
            tool_call: ToolCall to execute
            tools: List of available WikiTool objects

        Returns:
            String result from the tool
        """
        tool = next((t for t in tools if t.name == tool_call.name), None)
        if not tool:
            return f"Error: Unknown tool '{tool_call.name}'"

        try:
            return tool.function(tool_call.arguments)
        except Exception as e:
            return f"Error executing {tool_call.name}: {str(e)}"

    @abstractmethod
    async def process_conversation(
        self,
        user_message: str,
        conversation_history: List[Dict[str, Any]],
        tools: List['WikiTool'],
        max_turns: int = 20,
        on_message: Optional[Callable[[str, str], Awaitable[None]]] = None,
        on_tool_call: Optional[Callable[[Dict], Awaitable[None]]] = None,
        on_usage: Optional[Callable[[UsageData], Awaitable[None]]] = None,
    ) -> ConversationResult:
        """
        Process a full conversation turn (handles loop internally).

        Args:
            user_message: User's input message
            conversation_history: Previous messages (includes system prompt)
            tools: Available WikiTool instances
            max_turns: Maximum iterations before stopping
            on_message: Callback for streaming messages (type, content)
            on_tool_call: Callback for tool execution details
            on_usage: Callback for token usage updates

        Returns:
            ConversationResult with final response and metadata
        """
        pass
