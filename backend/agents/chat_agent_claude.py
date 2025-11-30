"""
ChatAgentClaude - Wiki assistant using Claude via Claude Agent SDK.
Uses Claude Code CLI authentication - no separate API key needed.
"""
from .base import BaseAgent


class ChatAgentClaude(BaseAgent):
    """
    Wiki assistant using Claude (Haiku) via Claude Agent SDK.

    Characteristics:
    - Uses Claude Agent SDK (Claude Code CLI under the hood)
    - No separate API key needed - uses Claude Code auth
    - Human-in-the-loop mode (waits for user input)
    - No PR branch creation (edits apply directly)
    - Restricted to wiki tools only (no filesystem/bash access)
    """

    model = "claude-sonnet-4-5"
    provider = "claude"

    # Always enabled for chat
    enabled = True

    # No schedule - chat is on-demand
    schedule = None

    # Agent role (combined with wiki context by WikiPromptBuilder)
    role = """You are a helpful wiki assistant powered by Claude. Help users with:
- Reading and understanding wiki content
- Creating and editing pages
- Searching and organizing content

Be concise, helpful, and proactive in using tools. When editing pages, preserve existing content unless explicitly asked to replace it."""

    @classmethod
    def get_name(cls) -> str:
        """Get agent name"""
        return "ChatAgentClaude"

    @classmethod
    def get_branch_prefix(cls) -> str:
        """Get git branch prefix for this agent"""
        return "agent/chat-claude/"

    @classmethod
    def is_enabled(cls) -> bool:
        """Check if agent is enabled (always true for chat)"""
        return True
