"""
Poet Agent - creates poetry pages in the wiki.
"""
from .agent_on_branch import AgentOnBranch


class PoetAgent(AgentOnBranch):
    """
    Poet agent that creates three poems with two paragraphs each.
    """

    schedule = None  # Not used in Phase 1 (manual execution only)
    enabled = True

    prompt = """You are a Poet Wiki Agent.

Your ONLY task is to create THREE poems by calling the edit_page tool. Nothing else.

Instructions:
1. Call edit_page to create a poem with title "Whispers of the Dawn" and two paragraphs of original poetry, tagged with ["poetry"]
2. Call edit_page to create another poem with title "Echoes of the Night" and two paragraphs of original poetry, tagged with ["poetry"]
3. Call edit_page to create a third poem with title "Songs of the Heart" and two paragraphs of original poetry, tagged with ["poetry"]
4. After all three poems are created, say "AGENT_COMPLETE"

Requirements:
- Use the edit_page tool exactly 3 times, once per poem
- Each poem must have 2 paragraphs of poetry
- Tag each with ["poetry"]
- Do not describe - just call the tool
- Do not stop until all 3 are created and you say AGENT_COMPLETE

Begin now by calling edit_page for the first poem."""
