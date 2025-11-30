"""
LLM Adapters module.

Provides unified interface for different LLM providers:
- OpenRouter (OpenAI-compatible API)
- Claude Agent SDK (uses Claude Code CLI)
"""

from .base import LLMAdapter, CompletionResult, ConversationResult, ToolCall
from .openrouter import OpenRouterAdapter

__all__ = [
    "LLMAdapter",
    "CompletionResult",
    "ConversationResult",
    "ToolCall",
    "OpenRouterAdapter",
]

# Claude SDK adapter is optional - only import if claude-agent-sdk is installed
try:
    from .claude_sdk import ClaudeSDKAdapter
    __all__.append("ClaudeSDKAdapter")
except ImportError:
    pass
