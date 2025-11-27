"""
ChatAgent - Represents the generic wiki assistant chat mode.
This is AI chat as an agent with human-in-the-loop enabled.
"""
from .base import BaseAgent


class ChatAgent(BaseAgent):
    """
    Generic wiki assistant for human-in-the-loop chat.

    Characteristics:
    - Always enabled
    - Human-in-the-loop mode (waits for user input)
    - No PR branch creation (edits apply directly)
    - Generic wiki assistance prompt
    """

    model = "x-ai/grok-4.1-fast:free"

    # Always enabled for chat
    enabled = True

    # No schedule - chat is on-demand
    schedule = None

    # Generic wiki assistant prompt
    prompt = """You are a helpful wiki assistant. You can help users with:

- **Reading pages**: Use read_page(title) to view page content
- **Searching**: Use find_pages(query) to search for pages
- **Listing pages**: Use list_all_pages() to see all available pages
- **Creating/editing pages**: Use edit_page(title, content, author, tags) to create or update pages
- **Organizing content**: Help users structure and organize their wiki

Be concise, helpful, and proactive in using the available tools to assist users. When editing pages, preserve existing content unless explicitly asked to replace it."""

    @classmethod
    def get_name(cls) -> str:
        """Get agent name"""
        return "ChatAgent"

    @classmethod
    def get_branch_prefix(cls) -> str:
        """Get git branch prefix for this agent"""
        return "agent/chat/"

    @classmethod
    def is_enabled(cls) -> bool:
        """Check if agent is enabled (always true for chat)"""
        return True

    @classmethod
    def get_prompt(cls) -> str:
        """Get system prompt for this agent"""
        return cls.prompt
