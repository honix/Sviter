"""
Wiki tools for agents.

WikiTool: Provider-agnostic tool definition
ToolBuilder: Factory for creating composable tool sets
"""
from typing import Dict, List, Any, Callable, TYPE_CHECKING
from dataclasses import dataclass
from storage import GitWiki, PageNotFoundException
import json
from datetime import datetime

if TYPE_CHECKING:
    from storage.git_wiki import GitWiki


@dataclass
class WikiTool:
    """
    Provider-agnostic tool definition.

    Can be converted to different formats for various LLM providers
    (OpenRouter, Claude SDK, etc.)
    """
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema format
    function: Callable[[Dict[str, Any]], str]  # Takes args dict, returns result string


# ─────────────────────────────────────────────────────────────────────────────
# Tool Implementations
# ─────────────────────────────────────────────────────────────────────────────

def _serialize_datetime(obj):
    """Convert datetime objects to ISO strings for JSON serialization"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj


def _read_page(wiki: GitWiki, title: str) -> str:
    """Read a wiki page by title"""
    if not title:
        return "Error: Page title is required"

    try:
        page = wiki.get_page(title)

        created_at = _serialize_datetime(page["created_at"])
        updated_at = _serialize_datetime(page["updated_at"])

        result = {
            "title": page["title"],
            "content": page["content"],
            "author": page["author"],
            "created_at": created_at,
            "updated_at": updated_at,
            "tags": page["tags"]
        }

        return f"Page '{title}' found:\n\nContent:\n{page['content']}\n\nMetadata: {json.dumps(result, indent=2)}"
    except PageNotFoundException:
        return f"Page '{title}' not found. You can create it using the edit_page tool."


def _edit_page(wiki: GitWiki, arguments: Dict[str, Any]) -> str:
    """Edit or create a wiki page"""
    title = arguments.get("title")
    content = arguments.get("content")
    author = arguments.get("author", "AI Agent")
    tags = arguments.get("tags", [])

    if not title or content is None:
        return "Error: Both title and content are required"

    try:
        wiki.get_page(title)
        wiki.update_page(title, content, author, tags)
        return f"Page '{title}' updated successfully. New content length: {len(content)} characters."
    except PageNotFoundException:
        wiki.create_page(title, content, author, tags)
        return f"Page '{title}' created successfully. Content length: {len(content)} characters."


def _find_pages(wiki: GitWiki, arguments: Dict[str, Any]) -> str:
    """Search for wiki pages"""
    query = arguments.get("query")
    limit = arguments.get("limit", 10)
    if isinstance(limit, str):
        limit = int(limit)

    if not query:
        return "Error: Search query is required"

    pages = wiki.search_pages(query, limit)

    if not pages:
        return f"No pages found matching '{query}'"

    results = []
    for page in pages:
        content = page["content"]
        excerpt = content[:200] + "..." if len(content) > 200 else content
        results.append({
            "title": page["title"],
            "excerpt": excerpt,
            "author": page["author"],
            "updated_at": _serialize_datetime(page["updated_at"]),
            "tags": page["tags"]
        })

    result_text = f"Found {len(pages)} pages matching '{query}':\n\n"
    for i, result in enumerate(results, 1):
        result_text += f"{i}. **{result['title']}** (by {result['author']})\n"
        result_text += f"   {result['excerpt']}\n"
        if result['tags']:
            result_text += f"   Tags: {', '.join(result['tags'])}\n"
        result_text += "\n"

    return result_text


def _list_all_pages(wiki: GitWiki, arguments: Dict[str, Any]) -> str:
    """List all wiki pages"""
    limit = arguments.get("limit", 50)
    if isinstance(limit, str):
        limit = int(limit)

    pages = wiki.list_pages(limit=limit)

    if not pages:
        return "No pages found in the wiki."

    result_text = f"Found {len(pages)} pages:\n\n"
    for i, page in enumerate(pages, 1):
        result_text += f"{i}. **{page['title']}** (by {page['author']})\n"

        if page.get('created_at'):
            created_at = page['created_at']
            if isinstance(created_at, datetime):
                result_text += f"   Created: {created_at.strftime('%Y-%m-%d %H:%M')}\n"
            else:
                try:
                    created = datetime.fromisoformat(str(created_at)).strftime('%Y-%m-%d %H:%M')
                    result_text += f"   Created: {created}\n"
                except:
                    result_text += f"   Created: {created_at}\n"

        if page.get('updated_at'):
            updated_at = page['updated_at']
            if isinstance(updated_at, datetime):
                result_text += f"   Updated: {updated_at.strftime('%Y-%m-%d %H:%M')}\n"
            else:
                try:
                    updated = datetime.fromisoformat(str(updated_at)).strftime('%Y-%m-%d %H:%M')
                    result_text += f"   Updated: {updated}\n"
                except:
                    result_text += f"   Updated: {updated_at}\n"

        if page.get('tags'):
            result_text += f"   Tags: {', '.join(page['tags'])}\n"
        result_text += "\n"

    return result_text


def _spawn_thread(
    spawn_callback: Callable[[str, str], Dict[str, Any]],
    args: Dict[str, Any]
) -> str:
    """Create a new worker thread"""
    name = args.get("name", "").strip()
    goal = args.get("goal", "").strip()

    if not name:
        return "Error: 'name' is required for spawn_thread"
    if not goal:
        return "Error: 'goal' is required for spawn_thread"

    try:
        result = spawn_callback(name, goal)
        return f"""Thread created successfully!
- Name: {result['name']}
- ID: {result['id']}
- Branch: {result['branch']}
- Status: {result['status']}

The thread is now working on your task. You can reference it as: [{result['name']}](thread:{result['id']})"""
    except Exception as e:
        return f"Error creating thread: {e}"


def _list_threads(
    list_callback: Callable[[], List[Dict[str, Any]]],
    args: Dict[str, Any]
) -> str:
    """List all active threads"""
    try:
        threads = list_callback()

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


def _request_help(help_callback: Callable[[str], None], args: Dict[str, Any]) -> str:
    """Ask user for help"""
    question = args.get("question", "").strip()
    if not question:
        return "Error: 'question' is required for request_help"

    help_callback(question)

    return f"""Help requested. Your question has been sent to the user:

"{question}"

The user will respond when they're available. Your execution is paused until they respond."""


def _mark_for_review(review_callback: Callable[[str], None], args: Dict[str, Any]) -> str:
    """Mark changes for review"""
    summary = args.get("summary", "Work complete").strip()

    review_callback(summary)

    return f"""Changes marked for review.

Summary: {summary}

The user will review your changes and either:
- Accept them (merges to main)
- Request modifications (you'll be notified)
- Reject them (changes discarded)

Your execution is complete for now."""


# ─────────────────────────────────────────────────────────────────────────────
# Tool Builder
# ─────────────────────────────────────────────────────────────────────────────

class ToolBuilder:
    """
    Factory for creating composable tool sets.

    Usage:
        # For main chat (read-only + thread management):
        tools = ToolBuilder.for_main(wiki, spawn_cb, list_cb)

        # For thread (full wiki + lifecycle):
        tools = ToolBuilder.for_thread(wiki, help_cb, review_cb)
    """

    @staticmethod
    def wiki_read_tools(wiki) -> List[WikiTool]:
        """Read-only wiki tools: read_page, find_pages, list_all_pages"""
        return [
            WikiTool(
                name="read_page",
                description="Read the content of a wiki page by title.",
                parameters={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Page title to read"}
                    },
                    "required": ["title"]
                },
                function=lambda args, w=wiki: _read_page(w, args.get("title"))
            ),
            WikiTool(
                name="find_pages",
                description="Search for wiki pages by title or content.",
                parameters={
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "limit": {"type": "integer", "description": "Max results (default: 10)"}
                    },
                    "required": ["query"]
                },
                function=lambda args, w=wiki: _find_pages(w, args)
            ),
            WikiTool(
                name="list_all_pages",
                description="Get a list of all wiki pages.",
                parameters={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "description": "Max pages (default: 50)"}
                    },
                    "required": []
                },
                function=lambda args, w=wiki: _list_all_pages(w, args)
            )
        ]

    @staticmethod
    def wiki_edit_tools(wiki) -> List[WikiTool]:
        """Edit wiki tool: edit_page"""
        return [
            WikiTool(
                name="edit_page",
                description="Create or update a wiki page with new content.",
                parameters={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Page title"},
                        "content": {"type": "string", "description": "New content (markdown format)"},
                        "author": {"type": "string", "description": "Author name (optional)"},
                        "tags": {"type": "array", "items": {"type": "string"}, "description": "Tags (optional)"}
                    },
                    "required": ["title", "content"]
                },
                function=lambda args, w=wiki: _edit_page(w, args)
            )
        ]

    @staticmethod
    def main_tools(
        spawn_callback: Callable[[str, str], Dict[str, Any]],
        list_callback: Callable[[], List[Dict[str, Any]]]
    ) -> List[WikiTool]:
        """Main chat tools: spawn_thread, list_threads"""
        return [
            WikiTool(
                name="spawn_thread",
                description="Create a new worker thread to edit wiki pages. The thread will work independently on the given goal.",
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Short name for the thread (e.g., 'update-python-docs')"},
                        "goal": {"type": "string", "description": "Clear description of what the thread should accomplish"}
                    },
                    "required": ["name", "goal"]
                },
                function=lambda args, cb=spawn_callback: _spawn_thread(cb, args)
            ),
            WikiTool(
                name="list_threads",
                description="List all active threads and their current status.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": []
                },
                function=lambda args, cb=list_callback: _list_threads(cb, args)
            )
        ]

    @staticmethod
    def thread_tools(
        help_callback: Callable[[str], None],
        review_callback: Callable[[str], None]
    ) -> List[WikiTool]:
        """Thread-specific tools: request_help, mark_for_review"""
        return [
            WikiTool(
                name="request_help",
                description="Ask the user for help when you're stuck or need clarification.",
                parameters={
                    "type": "object",
                    "properties": {
                        "question": {"type": "string", "description": "Your question for the user - be specific about what you need"}
                    },
                    "required": ["question"]
                },
                function=lambda args, cb=help_callback: _request_help(cb, args)
            ),
            WikiTool(
                name="mark_for_review",
                description="Mark your changes as complete and ready for user review.",
                parameters={
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string", "description": "Summary of changes made - describe what you did"}
                    },
                    "required": ["summary"]
                },
                function=lambda args, cb=review_callback: _mark_for_review(cb, args)
            )
        ]

    @staticmethod
    def for_main(
        wiki,
        spawn_callback: Callable[[str, str], Dict[str, Any]],
        list_callback: Callable[[], List[Dict[str, Any]]]
    ) -> List[WikiTool]:
        """
        Get tools for main assistant: read-only wiki + thread management.
        """
        return (
            ToolBuilder.wiki_read_tools(wiki) +
            ToolBuilder.main_tools(spawn_callback, list_callback)
        )

    @staticmethod
    def for_thread(
        wiki,
        help_callback: Callable[[str], None],
        review_callback: Callable[[str], None]
    ) -> List[WikiTool]:
        """
        Get tools for thread agent: full wiki + lifecycle management.
        """
        return (
            ToolBuilder.wiki_read_tools(wiki) +
            ToolBuilder.wiki_edit_tools(wiki) +
            ToolBuilder.thread_tools(help_callback, review_callback)
        )
