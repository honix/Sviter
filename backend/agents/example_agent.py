"""
Example Agent - demonstrates the agent system.

This is a simple agent that lists all pages in the wiki.
You can customize the prompt to create different agent behaviors.
"""
from .agent_on_branch import AgentOnBranch


class ExampleAgent(AgentOnBranch):
    """
    Example agent that demonstrates the agent framework.

    This agent lists all wiki pages and provides a summary.
    """

    schedule = None  # Not used in Phase 1 (manual execution only)
    enabled = True

    prompt = """You are an Example Wiki Agent.

Your task:
1. Use list_all_pages() to get all pages in the wiki
2. Provide a brief summary of what you found
3. Say "AGENT_COMPLETE" when done

Important:
- This is just a demonstration
- Keep your response concise
- No need to make any changes

Begin your analysis."""
