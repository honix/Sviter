"""
Thread Agent - Worker agent for threads with full wiki editing capabilities.

Thread agents:
- Can read and edit wiki pages
- Work on a specific goal
- Can request help from users when stuck
- Mark their work for review when done
"""

from typing import List, Dict, Any, Callable
from agents.base import BaseAgent
from ai.tools import WikiTool, WikiTools


class ThreadAgent(BaseAgent):
    """
    Worker agent for threads - has full wiki editing capabilities
    plus request_help and mark_for_review tools.

    Runs autonomously on its own branch until:
    - It calls mark_for_review (work complete)
    - It calls request_help (stuck, needs user input)
    - It encounters an error
    """

    model = "claude-sonnet-4-5"
    provider = "claude"
    enabled = True
    human_in_loop = False  # Runs autonomously until help needed or done
    create_branch = False  # Branch created by ThreadManager, not agent

    # Role is set dynamically by ThreadManager with the goal
    role = ""

    @classmethod
    def get_name(cls) -> str:
        return "ThreadAgent"


def get_thread_tools(
    wiki,
    request_help_callback: Callable[[str], None],
    mark_for_review_callback: Callable[[str], None]
) -> List[WikiTool]:
    """
    Get tools for Thread agent - full wiki tools + request_help + mark_for_review.

    Args:
        wiki: GitWiki instance
        request_help_callback: Called when agent needs help (question)
        mark_for_review_callback: Called when agent marks work for review (summary)

    Returns:
        List of WikiTool objects
    """

    def read_page_func(args: Dict[str, Any]) -> str:
        return WikiTools._read_page(wiki, args.get("title"))

    def edit_page_func(args: Dict[str, Any]) -> str:
        return WikiTools._edit_page(wiki, args)

    def find_pages_func(args: Dict[str, Any]) -> str:
        return WikiTools._find_pages(wiki, args)

    def list_all_pages_func(args: Dict[str, Any]) -> str:
        return WikiTools._list_all_pages(wiki, args)

    def request_help_func(args: Dict[str, Any]) -> str:
        question = args.get("question", "").strip()
        if not question:
            return "Error: 'question' is required for request_help"

        # Call the callback to change status
        request_help_callback(question)

        return f"""Help requested. Your question has been sent to the user:

"{question}"

The user will respond when they're available. Your execution is paused until they respond."""

    def mark_for_review_func(args: Dict[str, Any]) -> str:
        summary = args.get("summary", "Work complete").strip()

        # Call the callback to change status
        mark_for_review_callback(summary)

        return f"""Changes marked for review.

Summary: {summary}

The user will review your changes and either:
- Accept them (merges to main)
- Request modifications (you'll be notified)
- Reject them (changes discarded)

Your execution is complete for now."""

    return [
        WikiTool(
            name="read_page",
            description="Read the content of a wiki page by title.",
            parameters={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Page title to read"
                    }
                },
                "required": ["title"]
            },
            function=read_page_func
        ),
        WikiTool(
            name="edit_page",
            description="Create or update a wiki page with new content.",
            parameters={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Page title"
                    },
                    "content": {
                        "type": "string",
                        "description": "New content (markdown format)"
                    },
                    "author": {
                        "type": "string",
                        "description": "Author name (optional)"
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Tags for the page (optional)"
                    }
                },
                "required": ["title", "content"]
            },
            function=edit_page_func
        ),
        WikiTool(
            name="find_pages",
            description="Search for wiki pages by title or content.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results"
                    }
                },
                "required": ["query"]
            },
            function=find_pages_func
        ),
        WikiTool(
            name="list_all_pages",
            description="Get a list of all wiki pages.",
            parameters={
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Max pages"
                    }
                },
                "required": []
            },
            function=list_all_pages_func
        ),
        WikiTool(
            name="request_help",
            description="Ask the user for help when you're stuck or need clarification. Use this when you don't have enough information to proceed or are unsure about something.",
            parameters={
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "Your question for the user - be specific about what you need"
                    }
                },
                "required": ["question"]
            },
            function=request_help_func
        ),
        WikiTool(
            name="mark_for_review",
            description="Mark your changes as complete and ready for user review. Use this when you've finished your task and want the user to review and approve your changes.",
            parameters={
                "type": "object",
                "properties": {
                    "summary": {
                        "type": "string",
                        "description": "Summary of changes made - describe what you did"
                    }
                },
                "required": ["summary"]
            },
            function=mark_for_review_func
        )
    ]
