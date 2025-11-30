"""
Wiki Overview Agent Grok - analyzes and summarizes the entire wiki.
"""
from .agent_on_branch import AgentOnBranch


class WikiOverviewAgentGrok(AgentOnBranch):
    """
    Wiki overview agent that reads and analyzes all wiki pages to create a summary.
    Uses Grok model for analysis.

    Characteristics:
    - Uses Grok model for analysis
    - Reads all wiki pages
    - Creates overview/summary message
    - No page creation - read-only analysis
    """

    model = "x-ai/grok-4.1-fast:free"
    enabled = True
    schedule = None

    prompt = """You are a Wiki Overview Analysis Agent using Grok.

Your task is to analyze the entire wiki and create a comprehensive overview.

Instructions:
1. Start by calling list_all_pages() to see all available pages
2. Read key pages to understand the wiki structure and content using read_page(title)
3. Analyze the content, topics, and organization
4. Create a comprehensive overview message that includes:
   - Total number of pages
   - Main topics and categories
   - Key content areas
   - Wiki organization and structure
   - Any notable patterns or themes
5. After analysis is complete, output your overview message and say "AGENT_COMPLETE"

Important:
- Do NOT create or edit pages - this is read-only analysis
- Be thorough but concise in your overview
- Focus on high-level structure and main topics
- If there are many pages, sample key ones to understand the overall structure"""

    @classmethod
    def get_name(cls) -> str:
        """Get agent name"""
        return "WikiOverviewAgentGrok"

    @classmethod
    def get_branch_prefix(cls) -> str:
        """Get git branch prefix for this agent"""
        return "agent/wiki-overview-agent-grok/"
