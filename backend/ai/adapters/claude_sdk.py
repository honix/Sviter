"""
Claude Agent SDK adapter for LLM completions.

Uses Claude Code CLI under the hood via claude-agent-sdk package.
No separate API key needed - uses Claude Code's authentication.
"""

from typing import Dict, List, Any, Optional, Callable, Awaitable, TYPE_CHECKING

from .base import LLMAdapter, CompletionResult, ConversationResult, ToolCall

if TYPE_CHECKING:
    from ai.tools import WikiTool

# Import Claude SDK components (optional dependency)
try:
    from claude_agent_sdk import (
        ClaudeSDKClient,
        ClaudeAgentOptions,
        tool,
        create_sdk_mcp_server,
        AssistantMessage,
        TextBlock,
        ToolUseBlock,
    )
    CLAUDE_SDK_AVAILABLE = True
except ImportError:
    CLAUDE_SDK_AVAILABLE = False


class ClaudeSDKAdapter(LLMAdapter):
    """
    Adapter for Claude Agent SDK.

    Key features:
    - Uses Claude Code CLI (no API key needed)
    - Tools via MCP server (in-process)
    - Restricts to ONLY wiki tools (no filesystem, bash, etc.)
    - Supports model selection via set_model()
    """

    MCP_SERVER_NAME = "wiki"  # Tools will be named: mcp__wiki__read_page, etc.

    def __init__(self, system_prompt: str = "", model: str = None, max_turns: int = 20):
        """
        Initialize Claude SDK adapter.

        Args:
            system_prompt: System prompt for the agent
            model: Claude model to use (None uses default)
            max_turns: Maximum conversation turns (default: 20)
        """
        if not CLAUDE_SDK_AVAILABLE:
            raise ImportError(
                "claude-agent-sdk is not installed. "
                "Install it with: pip install claude-agent-sdk"
            )

        self.system_prompt = system_prompt
        self.model = model
        self.max_turns = max_turns
        self.mcp_server = None
        self.tool_names: List[str] = []
        self._tools: List['WikiTool'] = []
        self._on_tool_call: Optional[Callable[[Dict], Awaitable[None]]] = None
        self._tool_call_count: int = 0

    def _create_mcp_server(self, tools: List['WikiTool']):
        """
        Convert WikiTool list to MCP server.

        Creates @tool decorated functions and wraps them in an in-process MCP server.
        """
        self._tools = tools
        mcp_tools = []
        self.tool_names = []
        adapter = self  # Capture self for closure

        for wiki_tool in tools:
            # Create tool function that calls the WikiTool function
            # We need to capture wiki_tool in the closure properly
            def make_tool_fn(wt: 'WikiTool'):
                @tool(wt.name, wt.description, wt.parameters.get("properties", {}))
                async def tool_fn(args):
                    print(f"🔧 MCP Tool '{wt.name}' called with args: {args}")
                    try:
                        result = wt.function(args)
                        print(f"🔧 MCP Tool '{wt.name}' result: {str(result)[:100]}...")

                        # Report tool call to UI with result
                        adapter._tool_call_count += 1
                        if adapter._on_tool_call:
                            await adapter._on_tool_call({
                                "tool_name": wt.name,
                                "arguments": args,
                                "result": str(result)[:500],  # Truncate for UI
                                "iteration": adapter._tool_call_count
                            })

                        return {"content": [{"type": "text", "text": str(result)}]}
                    except Exception as e:
                        print(f"❌ MCP Tool '{wt.name}' error: {e}")
                        return {"content": [{"type": "text", "text": f"Error: {e}"}]}
                return tool_fn

            mcp_tools.append(make_tool_fn(wiki_tool))

            # Track tool name for allowed_tools restriction
            self.tool_names.append(wiki_tool.name)

        print(f"🔧 Creating MCP server '{self.MCP_SERVER_NAME}' with tools: {self.tool_names}")
        self.mcp_server = create_sdk_mcp_server(
            name=self.MCP_SERVER_NAME,
            version="1.0.0",
            tools=mcp_tools
        )

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
        Process conversation with Claude SDK (SDK handles loop internally).

        IMPORTANT: Uses allowed_tools to restrict Claude to ONLY wiki MCP tools.
        This prevents filesystem access, command execution, file search.

        Args:
            user_message: User's message/query
            conversation_history: Previous messages (includes system prompt)
            tools: List of WikiTool objects
            max_turns: Maximum conversation turns
            on_message: Callback for streaming (type, content)
            on_tool_call: Callback for tool execution (not used - SDK handles internally)

        Returns:
            ConversationResult with final response
        """
        print(f"🔵 ClaudeSDKAdapter.process_conversation called with {len(tools)} tools")
        print(f"🔵 User message: {user_message[:50]}...")

        # Extract system prompt from conversation history
        system_prompt = self.system_prompt
        for msg in conversation_history:
            if isinstance(msg, dict) and msg.get("role") == "system":
                system_prompt = msg.get("content", "")
                break

        # Store callback for MCP tool wrapper to use
        self._on_tool_call = on_tool_call
        self._tool_call_count = 0

        # Create MCP server with tools (uses stored callback)
        self._create_mcp_server(tools)

        options = ClaudeAgentOptions(
            system_prompt=system_prompt,
            max_turns=max_turns,
            model=self.model,
            # mcp_servers is a dict: {"server_name": config}
            mcp_servers={self.MCP_SERVER_NAME: self.mcp_server},
            # CRITICAL: Restrict to ONLY our wiki MCP tools
            # This blocks filesystem, bash, and all other Claude Code tools
            allowed_tools=self.tool_names,
            # Allow tools to run without asking for permission
            permission_mode='bypassPermissions',
        )

        try:
            async with ClaudeSDKClient(options=options) as client:
                await client.query(user_message)
                response_text = ""
                async for msg in client.receive_response():
                    # Extract text content from AssistantMessage
                    # Tool calls are reported from MCP wrapper with results
                    if isinstance(msg, AssistantMessage) and msg.content:
                        for block in msg.content:
                            if isinstance(block, TextBlock):
                                response_text += block.text
                                if on_message:
                                    await on_message("assistant", block.text)

                return ConversationResult(
                    status='completed',
                    stop_reason='natural_completion',
                    iterations=max(1, self._tool_call_count),  # Count tool calls as iterations
                    final_response=response_text
                )
        except Exception as e:
            return ConversationResult(
                status='error',
                stop_reason='exception',
                iterations=0,
                final_response="",
                error=str(e)
            )

    # These methods are for compatibility with LLMAdapter interface
    # but Claude SDK handles the conversation loop internally

    def create_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: List['WikiTool'],
        system_prompt: str
    ) -> CompletionResult:
        """
        Note: Claude SDK handles conversations differently.

        For synchronous single-turn completion, use run_agent() instead.
        This method is provided for interface compatibility but raises NotImplementedError.
        """
        raise NotImplementedError(
            "Claude SDK adapter uses run_agent() for async conversation handling. "
            "Use run_agent() for Claude SDK interactions."
        )

    def format_tool_result(self, tool_call_id: str, result: str) -> Dict[str, Any]:
        """
        Note: Claude SDK handles tool results internally.

        This method is not used with Claude SDK as the SDK manages
        the tool call/result cycle automatically.
        """
        # Return a placeholder - not actually used
        return {
            "tool_use_id": tool_call_id,
            "content": result
        }

    def format_assistant_message(self, result: CompletionResult) -> Dict[str, Any]:
        """
        Note: Claude SDK handles message formatting internally.
        """
        return {
            "role": "assistant",
            "content": result.content
        }
