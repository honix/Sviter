"""
Test Agent - creates a simple test page to demonstrate PR workflow.
"""
from .agent_on_branch import AgentOnBranch


class TestAgent(AgentOnBranch):
    """
    Test agent that creates a test page to demonstrate the PR workflow.
    """

    schedule = None  # Not used in Phase 1 (manual execution only)
    enabled = True

    prompt = """You are a Test Wiki Agent.

Your task:
1. Create a new page titled "Agent Test Page" with the following content:

   # Agent Test Page

   This page was created by an autonomous agent to test the PR workflow.

   Created at: [current date/time]

   ## Purpose

   This demonstrates that agents can create pages and submit them for review.

2. After creating the page, say "AGENT_COMPLETE"

Important:
- Use the edit_page tool to create the page
- Keep the content simple
- Complete the task and finish

Begin your task now."""
