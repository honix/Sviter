"""
Scout Agent - Read-only wiki assistant that can spawn threads.

The Scout is the default agent for the main chat. It can:
- Read and search wiki pages
- Spawn worker threads for editing tasks
- List active threads and their status

It CANNOT edit pages directly - all edits go through threads.
"""

from typing import List, Dict, Any, Callable
from agents.base import BaseAgent
from ai.tools import WikiTool, WikiTools


class ScoutAgent(BaseAgent):
    """
    Read-only wiki assistant that can spawn threads.

    Always runs on main branch.
    Cannot edit pages - only read, search, and spawn threads.
    """

    model = "claude-sonnet-4-5"
    provider = "claude"
    enabled = True
    human_in_loop = True   # Interactive chat
    create_branch = False  # Never creates branches

    role = """You are the Scout - a read-only wiki assistant.

Your capabilities:
- Read and search wiki pages
- Help users understand wiki content
- Spawn worker threads for editing tasks
- List active threads and their status

IMPORTANT: You CANNOT edit pages directly. When users want to make changes:
1. Use spawn_thread(name, goal) to create a worker thread
2. The thread will work on their request independently
3. Users can monitor thread progress and approve changes

When creating threads:
- Give clear, specific goals
- Use descriptive names (e.g., "update-python-docs", "fix-typos-readme")
- One thread per focused task

Example responses with links:
- "I've started a thread to handle that: [update-docs](thread:abc123)"
- "Check out the [Python Guide](page:Python Guide) for more info"
- "Here are your active threads: [Thread 1](thread:id1), [Thread 2](thread:id2)"

Use list_threads() to check on active thread status before spawning new ones."""

    @classmethod
    def get_name(cls) -> str:
        return "ScoutAgent"


def get_scout_tools(
    wiki,
    spawn_thread_callback: Callable[[str, str], Dict[str, Any]],
    list_threads_callback: Callable[[], List[Dict[str, Any]]]
) -> List[WikiTool]:
    """
    Get tools for Scout agent - read-only wiki tools + spawn_thread + list_threads.

    Args:
        wiki: GitWiki instance
        spawn_thread_callback: Function to spawn thread, returns {id, name, branch, ...}
        list_threads_callback: Function to list threads, returns list of thread dicts

    Returns:
        List of WikiTool objects
    """

    def read_page_func(args: Dict[str, Any]) -> str:
        return WikiTools._read_page(wiki, args.get("title"))

    def find_pages_func(args: Dict[str, Any]) -> str:
        return WikiTools._find_pages(wiki, args)

    def list_all_pages_func(args: Dict[str, Any]) -> str:
        return WikiTools._list_all_pages(wiki, args)

    def spawn_thread_func(args: Dict[str, Any]) -> str:
        name = args.get("name", "").strip()
        goal = args.get("goal", "").strip()

        if not name:
            return "Error: 'name' is required for spawn_thread"
        if not goal:
            return "Error: 'goal' is required for spawn_thread"

        try:
            result = spawn_thread_callback(name, goal)
            return f"""Thread created successfully!
- Name: {result['name']}
- ID: {result['id']}
- Branch: {result['branch']}
- Status: {result['status']}

The thread is now working on your task. You can reference it as: [{result['name']}](thread:{result['id']})"""
        except Exception as e:
            return f"Error creating thread: {e}"

    def list_threads_func(args: Dict[str, Any]) -> str:
        try:
            threads = list_threads_callback()

            if not threads:
                return "No active threads."

            lines = ["Active threads:"]
            for t in threads:
                status_emoji = {
                    "working": "🔄",
                    "need_help": "⚠️",
                    "review": "✅"
                }.get(t['status'], "❓")

                lines.append(f"- {status_emoji} [{t['name']}](thread:{t['id']}) - {t['status']}")
                if t.get('goal'):
                    lines.append(f"  Goal: {t['goal'][:50]}...")

            return "\n".join(lines)
        except Exception as e:
            return f"Error listing threads: {e}"

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
                        "description": "Max results (default: 10)"
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
                        "description": "Max pages (default: 50)"
                    }
                },
                "required": []
            },
            function=list_all_pages_func
        ),
        WikiTool(
            name="spawn_thread",
            description="Create a new worker thread to edit wiki pages. The thread will work independently on the given goal. Use this when users want to make changes to the wiki.",
            parameters={
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Short name for the thread (e.g., 'update-python-docs')"
                    },
                    "goal": {
                        "type": "string",
                        "description": "Clear description of what the thread should accomplish"
                    }
                },
                "required": ["name", "goal"]
            },
            function=spawn_thread_func
        ),
        WikiTool(
            name="list_threads",
            description="List all active threads and their current status. Use this to check on thread progress or before spawning new threads.",
            parameters={
                "type": "object",
                "properties": {},
                "required": []
            },
            function=list_threads_func
        )
    ]
