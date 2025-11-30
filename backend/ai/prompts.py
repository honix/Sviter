"""
Prompt builder for wiki agents.
Combines generic wiki context with agent-specific roles.
"""


class WikiPromptBuilder:
    """Builds composite system prompts for wiki agents"""

    WIKI_CONTEXT = """You are an AI agent working with a wiki system.

## Available Tools
- **read_page(title)**: Read the full content of a wiki page
- **edit_page(title, content, author?, tags?)**: Create or update a wiki page
- **find_pages(query)**: Search for pages matching a query
- **list_all_pages()**: Get a list of all wiki pages

## Guidelines
- Use tools strategically to gather information before responding
- When editing pages, preserve existing content unless explicitly asked to replace
- You can make multiple sequential tool calls to complete complex tasks
- Be concise and focused on the user's request
"""

    @classmethod
    def build(cls, agent_role: str) -> str:
        """
        Combine wiki context with agent-specific role.

        Args:
            agent_role: Agent-specific role description

        Returns:
            Complete system prompt with wiki context + role
        """
        if not agent_role:
            return cls.WIKI_CONTEXT.strip()
        return f"{cls.WIKI_CONTEXT}\n## Your Role\n{agent_role}"

    @classmethod
    def get_wiki_context(cls) -> str:
        """Get just the wiki context without any role"""
        return cls.WIKI_CONTEXT.strip()
