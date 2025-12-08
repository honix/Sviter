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
    - Persistent client maintains conversation history automatically

    Security:
    - allowed_tools: Whitelists only MCP wiki tools
    - disallowed_tools: Explicitly blocks built-in Claude Code tools (Read, Write, Bash, etc.)
    - This double restriction prevents filesystem access outside wiki operations
    """

    MCP_SERVER_NAME = "wiki"  # Tools will be named: mcp__wiki__read_page, etc.

    # Built-in Claude Code tools to block (these bypass allowed_tools!)
    BLOCKED_BUILTIN_TOOLS = [
        "Read",           # File reading
        "Write",          # File writing
        "Edit",           # File editing
        "MultiEdit",      # Batch file editing
        "Bash",           # Shell command execution
        "Glob",           # File pattern matching
        "Grep",           # Content search
        "LS",             # Directory listing
        "NotebookEdit",   # Jupyter notebook editing
        "WebFetch",       # Web requests
        "WebSearch",      # Web search
        "Task",           # Spawning sub-agents
    ]

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
        # Persistent client - SDK maintains conversation history automatically
        self._client: Optional['ClaudeSDKClient'] = None
        self._client_connected: bool = False

    async def disconnect(self):
        """Disconnect and clean up the persistent client."""
        if self._client:
            try:
                await self._client.__aexit__(None, None, None)
            except Exception:
                pass
            self._client = None
            self._client_connected = False

    def clear_history(self):
        """Clear conversation history by resetting the client."""
        # Will create fresh client on next process_conversation call
        self._client = None
        self._client_connected = False

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
            # MCP tools must be prefixed: mcp__{server_name}__{tool_name}
            self.tool_names.append(f"mcp__{self.MCP_SERVER_NAME}__{wiki_tool.name}")

        print(f"🔧 Creating MCP server '{self.MCP_SERVER_NAME}' with tools: {self.tool_names}")
        print(f"🔒 Blocking built-in tools: {self.BLOCKED_BUILTIN_TOOLS}")
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
        Process conversation with Claude SDK using persistent client.

        The SDK maintains conversation history automatically across calls.
        IMPORTANT: Uses allowed_tools to restrict Claude to ONLY wiki MCP tools.

        Args:
            user_message: User's message/query
            conversation_history: Previous messages (includes system prompt) - used for system prompt extraction only
            tools: List of WikiTool objects
            max_turns: Maximum conversation turns
            on_message: Callback for streaming (type, content)
            on_tool_call: Callback for tool execution

        Returns:
            ConversationResult with final response
        """
        print(f"🔵 ClaudeSDKAdapter.process_conversation called with {len(tools)} tools")
        print(f"🔵 User message: {user_message[:50]}...")
        print(f"🔵 Client connected: {self._client_connected}")

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

        try:
            # Create client if not exists (first call)
            if not self._client:
                options = ClaudeAgentOptions(
                    system_prompt=system_prompt,
                    max_turns=max_turns,
                    model=self.model,
                    mcp_servers={self.MCP_SERVER_NAME: self.mcp_server},
                    # CRITICAL: Restrict to ONLY our wiki MCP tools
                    allowed_tools=self.tool_names,
                    # SECURITY: Block built-in Claude Code tools (Read, Write, Bash, etc.)
                    # These bypass allowed_tools and must be explicitly disallowed!
                    disallowed_tools=self.BLOCKED_BUILTIN_TOOLS,
                    permission_mode='bypassPermissions',
                )
                self._client = ClaudeSDKClient(options=options)
                await self._client.__aenter__()
                self._client_connected = True
                print("🔵 Created new persistent ClaudeSDKClient")

            # Send message - SDK maintains conversation history automatically
            await self._client.query(user_message)

            response_text = ""
            async for msg in self._client.receive_response():
                # Extract text content from AssistantMessage
                if isinstance(msg, AssistantMessage) and msg.content:
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            response_text += block.text
                            if on_message:
                                await on_message("assistant", block.text)

            return ConversationResult(
                status='completed',
                stop_reason='natural_completion',
                iterations=max(1, self._tool_call_count),
                final_response=response_text
            )
        except Exception as e:
            # Reset client on error so next call creates fresh one
            await self.disconnect()
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
