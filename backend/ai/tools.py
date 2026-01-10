"""
Wiki tools for agents.

WikiTool: Provider-agnostic tool definition
ToolBuilder: Factory for creating composable tool sets

Claude Code-style tools:
- Read: read_page (with line numbers), grep_pages, glob_pages, list_pages
- Git: git_history (branch commit history), git_diff (branch comparison)
- Write: write_page, edit_page (exact match), insert_at_line, delete_page, move (mv-style)
"""
from typing import Dict, List, Any, Callable, TYPE_CHECKING
from dataclasses import dataclass
from storage import GitWiki, PageNotFoundException
import json

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
    # Takes args dict, returns result string
    function: Callable[[Dict[str, Any]], str]




# ─────────────────────────────────────────────────────────────────────────────
# Reading Tools
# ─────────────────────────────────────────────────────────────────────────────

def _read_page(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """Read a wiki page with line numbers"""
    title = args.get("path", "") or args.get("title", "")  # Support both for compatibility
    offset = args.get("offset", 1)  # 1-indexed
    limit = args.get("limit", 2000)

    if isinstance(offset, str):
        offset = int(offset)
    if isinstance(limit, str):
        limit = int(limit)

    if not title:
        return "Error: Page path is required"

    try:
        page = wiki.get_page(title)
        content = page["content"]
        lines = content.split('\n')
        total_lines = len(lines)

        # Apply offset/limit (convert to 0-indexed internally)
        start_idx = max(0, offset - 1)
        end_idx = min(len(lines), start_idx + limit)
        selected_lines = lines[start_idx:end_idx]

        # Use path as primary identifier for agents
        page_path = page.get('path', title)

        # Build header (simplified - no metadata)
        header = [f"Page: {page_path}"]
        header.append(f"Total lines: {total_lines}")
        if offset > 1 or end_idx < total_lines:
            header.append(f"Showing lines {offset}-{start_idx + len(selected_lines)}")
        header.append("---")

        # Format with line numbers
        formatted_lines = []
        for i, line in enumerate(selected_lines, start=offset):
            # Truncate long lines
            display_line = line[:2000] + "..." if len(line) > 2000 else line
            formatted_lines.append(f"{i:5} | {display_line}")

        return "\n".join(header + formatted_lines)

    except PageNotFoundException:
        return f"Error: Page '{title}' not found.\n\nUse list_pages to see available pages, or write_page to create a new one."


def _grep_pages(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """Search wiki pages using regex pattern"""
    pattern = args.get("pattern", "")
    limit = args.get("limit", 50)
    context = args.get("context", 0)
    case_sensitive = args.get("case_sensitive", False)

    if isinstance(limit, str):
        limit = int(limit)
    if isinstance(context, str):
        context = int(context)

    if not pattern:
        return "Error: Search pattern is required"

    # Enforce limits
    limit = min(limit, 200)
    context = min(context, 5)

    matches = wiki.search_pages_regex(pattern, limit, context, case_sensitive)

    if not matches:
        return f"No matches found for pattern '{pattern}'"

    # Check for error
    if matches and "error" in matches[0]:
        return matches[0]["error"]

    # Format output
    lines = [
        f"Found {len(matches)} match{'es' if len(matches) != 1 else ''} for pattern '{pattern}':\n"]

    current_page = None
    for match in matches:
        # Group by page (use path as primary identifier)
        if match["page_path"] != current_page:
            current_page = match["page_path"]
            lines.append(f"\n[{current_page}]")

        line_num = match["line_number"]

        # Show context before
        for i, ctx_line in enumerate(match.get("context_before", [])):
            ctx_num = line_num - len(match.get("context_before", [])) + i
            lines.append(f"    {ctx_num:5} | {ctx_line}")

        # Show matching line with marker
        lines.append(f" >> {line_num:5} | {match['content']}")

        # Show context after
        for i, ctx_line in enumerate(match.get("context_after", [])):
            ctx_num = line_num + i + 1
            lines.append(f"    {ctx_num:5} | {ctx_line}")

    return "\n".join(lines)


def _glob_pages(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """Find pages by title/path pattern"""
    pattern = args.get("pattern", "")
    limit = args.get("limit", 50)

    if isinstance(limit, str):
        limit = int(limit)

    if not pattern:
        return "Error: Pattern is required"

    limit = min(limit, 200)

    results = wiki.glob_pages(pattern, limit)

    if not results:
        return f"No pages found matching pattern '{pattern}'"

    lines = [
        f"Found {len(results)} page{'s' if len(results) != 1 else ''} matching '{pattern}':\n"]

    for i, page in enumerate(results, 1):
        lines.append(f"{i}. {page.get('path', page['title'])}")

    return "\n".join(lines)


def _list_pages(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """List all wiki pages"""
    limit = args.get("limit", 50)

    if isinstance(limit, str):
        limit = int(limit)

    limit = min(limit, 200)

    pages = wiki.list_pages(limit=limit)

    if not pages:
        return "No pages found in the wiki."

    # Pages are already sorted alphabetically by backend

    lines = [f"Found {len(pages)} page{'s' if len(pages) != 1 else ''} (sorted alphabetically):\n"]

    for i, page in enumerate(pages, 1):
        # Use path as primary identifier
        page_path = page.get('path', page['title'])
        lines.append(f"{i}. {page_path}")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Git Tools
# ─────────────────────────────────────────────────────────────────────────────

def _git_history(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """Get commit history for a branch"""
    branch = args.get("branch")  # None = current branch
    limit = args.get("limit", 20)
    since_main = args.get("since_main", False)

    if isinstance(limit, str):
        limit = int(limit)

    # Handle string booleans from LLM
    if isinstance(since_main, str):
        since_main = since_main.lower() in ('true', '1', 'yes')

    limit = min(limit, 100)

    try:
        history = wiki.get_branch_history(branch, limit, since_main)

        if not history:
            branch_name = branch or wiki.get_current_branch()
            if since_main:
                return f"No commits on '{branch_name}' since diverging from main."
            return f"No commits found on '{branch_name}'."

        branch_name = branch or wiki.get_current_branch()
        header = f"Commit history for '{branch_name}'"
        if since_main:
            header += " (since main)"
        header += f" ({len(history)} commits):\n"

        lines = [header]
        for commit in history:
            lines.append(f"\n[{commit['short_sha']}] {commit['message']}")
            lines.append(f"  Author: {commit['author']} | {commit['date'][:10]}")
            if commit['files_changed']:
                files_str = ", ".join(commit['files_changed'][:5])
                if len(commit['files_changed']) > 5:
                    files_str += f" (+{len(commit['files_changed']) - 5} more)"
                lines.append(f"  Files: {files_str}")

        return "\n".join(lines)

    except Exception as e:
        return f"Error getting git history: {e}"


def _git_diff(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """Get diff between two branches/refs"""
    base = args.get("base", "main")
    target = args.get("target")
    stat_only = args.get("stat_only", False)

    # Handle string booleans from LLM
    if isinstance(stat_only, str):
        stat_only = stat_only.lower() in ('true', '1', 'yes')

    if not target:
        # Default to current branch
        try:
            target = wiki.get_current_branch()
        except Exception:
            return "Error: Could not determine current branch. Please specify 'target' branch."

    if base == target:
        return f"No differences - '{base}' and '{target}' are the same."

    try:
        if stat_only:
            # Get statistics only
            stats = wiki.get_diff_stat(base, target)
            if not stats.get('files_changed'):
                return f"No differences between '{base}' and '{target}'."

            lines = [f"Diff stats: {base}..{target}\n"]
            for file_info in stats['files_changed']:
                lines.append(f"  {file_info['path']}: {file_info['changes']}")
            lines.append(f"\n{stats['summary']}")
            return "\n".join(lines)
        else:
            # Get full diff
            diff = wiki.get_diff(base, target)
            if not diff:
                return f"No differences between '{base}' and '{target}'."

            # Truncate if too long
            if len(diff) > 15000:
                diff = diff[:15000] + "\n\n... (diff truncated, use stat_only=true for overview)"

            return f"Diff: {base}..{target}\n\n{diff}"

    except Exception as e:
        return f"Error getting diff: {e}"


# ─────────────────────────────────────────────────────────────────────────────
# Writing Tools
# ─────────────────────────────────────────────────────────────────────────────

def _write_page(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """Create or completely overwrite a wiki page"""
    title = args.get("path", "") or args.get("title", "")  # Support both for compatibility
    content = args.get("content")
    author = args.get("author", "AI Agent")
    tags = args.get("tags", [])

    if not title:
        return "Error: Page path is required"
    if content is None:
        return "Error: Page content is required"

    try:
        # Check if page exists
        existing = None
        try:
            existing = wiki.get_page(title)
        except PageNotFoundException:
            pass

        if existing:
            wiki.update_page(title, content, author, tags)
            action = "overwritten"
        else:
            wiki.create_page(title, content, author, tags)
            action = "created"

        line_count = len(content.split('\n'))

        return f"""Page '{title}' {action} successfully.
- Content length: {len(content)} characters
- Lines: {line_count}
- Author: {author}
- Tags: {', '.join(tags) if tags else 'none'}"""

    except Exception as e:
        return f"Error writing page: {e}"


def _edit_page(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """Edit page by replacing exact text match (Claude Code style)"""
    title = args.get("path", "") or args.get("title", "")  # Support both for compatibility
    old_text = args.get("old_text", "")
    new_text = args.get("new_text", "")
    replace_all = args.get("replace_all", False)
    author = args.get("author", "AI Agent")

    if not title:
        return "Error: Page path is required"
    if not old_text:
        return "Error: old_text is required - the exact text to find and replace"
    if new_text is None:
        return "Error: new_text is required (can be empty string to delete)"

    try:
        page = wiki.get_page(title)
        content = page["content"]

        # Count occurrences
        count = content.count(old_text)

        if count == 0:
            return f"""Error: old_text not found in page '{title}'.

The text you're looking for does not exist. This could be due to:
1. Whitespace differences (spaces, tabs, newlines)
2. The text was already changed
3. Typo in old_text

Use read_page to see the exact current content."""

        if count > 1 and not replace_all:
            return f"""Error: old_text matches {count} times in page '{title}'.

For safety, edit_page requires unique matches by default.
Either:
1. Include more context in old_text to make it unique
2. Set replace_all=true to replace all occurrences"""

        # Find affected line numbers before replacement
        lines_before = content.split('\n')
        affected_lines = []
        for i, line in enumerate(lines_before, 1):
            if old_text in line or (i > 1 and old_text in '\n'.join(lines_before[i-2:i])):
                affected_lines.append(i)

        # Perform replacement
        if replace_all:
            new_content = content.replace(old_text, new_text)
            replacements = count
        else:
            new_content = content.replace(old_text, new_text, 1)
            replacements = 1

        # Update page
        wiki.update_page(
            title=title,
            content=new_content,
            author=author,
            commit_msg=f"Edit page: {title}"
        )

        result = [f"Page '{title}' edited successfully."]
        result.append(
            f"- Replaced {replacements} occurrence{'s' if replacements > 1 else ''}")
        if affected_lines:
            if len(affected_lines) <= 3:
                result.append(
                    f"- Lines affected: {', '.join(map(str, affected_lines))}")
            else:
                result.append(
                    f"- Lines affected: {affected_lines[0]}-{affected_lines[-1]}")
        result.append(f"- New content length: {len(new_content)} characters")

        return "\n".join(result)

    except PageNotFoundException:
        return f"Error: Page '{title}' not found.\n\nUse write_page to create a new page."
    except Exception as e:
        return f"Error editing page: {e}"


def _insert_at_line(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """Insert content at a specific line number"""
    title = args.get("path", "") or args.get("title", "")  # Support both for compatibility
    line = args.get("line", 1)
    content = args.get("content", "")
    author = args.get("author", "AI Agent")

    if isinstance(line, str):
        line = int(line)

    if not title:
        return "Error: Page path is required"
    if not content:
        return "Error: Content to insert is required"

    try:
        page = wiki.get_page(title)
        existing_content = page["content"]
        lines = existing_content.split('\n')
        total_lines = len(lines)

        # Validate line number
        if line < 1:
            return "Error: Line number must be 1 or greater"

        # Insert content
        insert_lines = content.split('\n')
        insert_count = len(insert_lines)

        if line > total_lines:
            # Append at end
            lines.extend(insert_lines)
            actual_line = total_lines + 1
        else:
            # Insert before specified line (0-indexed)
            for i, new_line in enumerate(insert_lines):
                lines.insert(line - 1 + i, new_line)
            actual_line = line

        new_content = '\n'.join(lines)

        wiki.update_page(
            title=title,
            content=new_content,
            author=author,
            commit_msg=f"Insert at line {actual_line}: {title}"
        )

        return f"""Content inserted at line {actual_line} in page '{title}'.
- Lines inserted: {insert_count}
- New total lines: {len(lines)}"""

    except PageNotFoundException:
        return f"Error: Page '{title}' not found.\n\nUse write_page to create a new page."
    except Exception as e:
        return f"Error inserting content: {e}"


def _delete_page(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """Delete a wiki page"""
    title = args.get("path", "") or args.get("title", "")
    author = args.get("author", "AI Agent")

    if not title:
        return "Error: Page path is required"

    try:
        wiki.delete_page(title, author)
        return f"Page '{title}' deleted successfully."
    except PageNotFoundException:
        return f"Error: Page '{title}' not found."
    except Exception as e:
        return f"Error deleting page: {e}"


def _move(wiki: GitWiki, args: Dict[str, Any]) -> str:
    """Move/rename a wiki page (like Unix mv command)"""
    from pathlib import Path

    path = args.get("path", "")
    new_path = args.get("new_path", "")
    author = args.get("author", "AI Agent")

    if not path:
        return "Error: path is required"
    if not new_path:
        return "Error: new_path is required"

    try:
        old_file = Path(path)
        new_file = Path(new_path)

        # Check if this is a move to different folder or just rename
        if old_file.parent != new_file.parent:
            # Move to different folder (may also rename)
            target_parent = str(new_file.parent) if str(new_file.parent) != '.' else ''

            # First move to the new folder
            result = wiki.move_item(
                source_path=path,
                target_parent=target_parent,
                new_order=0,  # Ignored by move_item
                author=author
            )

            # If new filename is different, rename it
            if old_file.name != new_file.name:
                moved_path = result.get("path", f"{target_parent}/{old_file.name}" if target_parent else old_file.name)
                result = wiki.rename_page(
                    old_path=moved_path,
                    new_name=new_file.name,
                    author=author
                )
        else:
            # Just rename in same folder
            result = wiki.rename_page(
                old_path=path,
                new_name=new_file.name,
                author=author
            )

        final_path = result.get("path", new_path)
        return f"Page moved/renamed successfully from '{path}' to '{final_path}'."
    except PageNotFoundException:
        return f"Error: Page '{path}' not found."
    except Exception as e:
        return f"Error moving/renaming page: {e}"


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
    """List all threads"""
    try:
        threads = list_callback()

        if not threads:
            return "No threads."

        lines = ["Threads:"]
        for t in threads:
            status_emoji = {
                "working": "🔄",
                "need_help": "⚠️",
                "review": "📋",
                "accepted": "✅",
                "rejected": "❌"
            }.get(t['status'], "❓")

            lines.append(
                f"- {status_emoji} [{t['name']}](thread:{t['id']}) - {t['status']}")
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
    Factory for creating composable tool sets (Claude Code style).

    Tool Categories:
    - read: read_page, grep_pages, glob_pages, list_pages
    - write: write_page, edit_page, insert_at_line, delete_page, move (mv-style)
    - thread: spawn_thread, list_threads (main only)
    - lifecycle: request_help, mark_for_review (thread only)

    Usage:
        # For main chat (read-only + thread management):
        tools = ToolBuilder.for_main(wiki, spawn_cb, list_cb)

        # For thread (full wiki + lifecycle):
        tools = ToolBuilder.for_thread(wiki, help_cb, review_cb)
    """

    @staticmethod
    def read_tools(wiki) -> List[WikiTool]:
        """Read-only wiki tools: read_page, grep_pages, glob_pages, list_pages, git_history, git_diff"""
        return [
            WikiTool(
                name="read_page",
                description="""Read a wiki page with line numbers. Use this to view page content before editing.

Features:
- Returns content with line numbers (1-indexed)
- Supports offset/limit for reading specific sections
- Lines longer than 2000 chars are truncated

TIP: Read agents/index.md first for wiki navigation and page descriptions.
IMPORTANT: Use the file path (e.g., 'home.md', 'agents/index.md') not display titles.""",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Page file path (e.g., 'home.md', 'agents/index.md')"},
                        "offset": {"type": "integer", "description": "Starting line number (1-indexed). Omit to start from beginning."},
                        "limit": {"type": "integer", "description": "Max lines to return (default: 2000)."}
                    },
                    "required": ["path"]
                },
                function=lambda args, w=wiki: _read_page(w, args)
            ),
            WikiTool(
                name="grep_pages",
                description="""Search wiki pages using regex pattern. Returns matching lines with context.

Features:
- Regex pattern matching (case-insensitive by default)
- Shows page path, line number, and matching content
- Optional context lines before/after matches
- Useful for finding where content is discussed""",
                parameters={
                    "type": "object",
                    "properties": {
                        "pattern": {"type": "string", "description": "Regex pattern to search for (e.g., 'def\\s+\\w+', 'TODO', 'error')"},
                        "limit": {"type": "integer", "description": "Max matches to return (default: 50, max: 200)"},
                        "context": {"type": "integer", "description": "Lines of context before/after match (default: 0, max: 5)"},
                        "case_sensitive": {"type": "boolean", "description": "Case-sensitive search (default: false)"}
                    },
                    "required": ["pattern"]
                },
                function=lambda args, w=wiki: _grep_pages(w, args)
            ),
            WikiTool(
                name="glob_pages",
                description="""Find pages by path pattern using glob-style matching.

Patterns:
- * matches any characters within a path segment
- ** matches any characters including path separators
- ? matches single character

Examples:
- 'docs/*' - all pages in docs folder
- '**/*api*' - pages with 'api' anywhere in path
- 'guide-?' - guide-1, guide-2, etc.""",
                parameters={
                    "type": "object",
                    "properties": {
                        "pattern": {"type": "string", "description": "Glob pattern to match page paths"},
                        "limit": {"type": "integer", "description": "Max results to return (default: 50)"}
                    },
                    "required": ["pattern"]
                },
                function=lambda args, w=wiki: _glob_pages(w, args)
            ),
            WikiTool(
                name="list_pages",
                description="""List all wiki pages (sorted alphabetically).

Use this to get an overview of wiki content. For searching specific content, use grep_pages. For matching path patterns, use glob_pages.

TIP: Read agents/index.md first for page descriptions and navigation.""",
                parameters={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "description": "Max pages to return (default: 50, max: 200)"}
                    },
                    "required": []
                },
                function=lambda args, w=wiki: _list_pages(w, args)
            )
        ] + ToolBuilder.git_tools(wiki)

    @staticmethod
    def git_tools(wiki) -> List[WikiTool]:
        """Git history and diff tools: git_history, git_diff"""
        return [
            WikiTool(
                name="git_history",
                description="""View commit history for a branch. Use this to see what changes were made and by whom.

Use cases:
- See what a thread agent did on its branch (use branch="thread/name-xyz")
- Check recent commits on main
- Understand change history before making edits

With since_main=true, shows only commits since branch diverged from main - useful for reviewing thread work.""",
                parameters={
                    "type": "object",
                    "properties": {
                        "branch": {"type": "string", "description": "Branch name to show history for. Omit for current branch. Example: 'thread/fix-typos-abc123'"},
                        "limit": {"type": "integer", "description": "Max commits to show (default: 20, max: 100)"},
                        "since_main": {"type": "boolean", "description": "If true, only show commits since branch diverged from main (default: false)"}
                    },
                    "required": []
                },
                function=lambda args, w=wiki: _git_history(w, args)
            ),
            WikiTool(
                name="git_diff",
                description="""Show differences between two branches. Use this to see exactly what changed.

Use cases:
- Compare thread branch to main to see what will be merged
- Review changes before accepting a thread
- Understand what pages were modified

Use stat_only=true for a quick overview (files changed, lines added/removed).""",
                parameters={
                    "type": "object",
                    "properties": {
                        "base": {"type": "string", "description": "Base branch to compare from (default: 'main')"},
                        "target": {"type": "string", "description": "Target branch to compare to. Omit for current branch. Example: 'thread/update-docs-xyz'"},
                        "stat_only": {"type": "boolean", "description": "If true, show only statistics (files, lines changed). If false, show full diff (default: false)"}
                    },
                    "required": []
                },
                function=lambda args, w=wiki: _git_diff(w, args)
            )
        ]

    @staticmethod
    def write_tools(wiki) -> List[WikiTool]:
        """Write wiki tools: write_page, edit_page, insert_at_line, delete_page, move (mv-style)"""
        return [
            WikiTool(
                name="write_page",
                description="""Create a new wiki page or completely overwrite an existing one.

IMPORTANT: This REPLACES the entire page content. For targeted edits, use edit_page instead.
IMPORTANT: Use the file path (e.g., 'home.md', 'agents/index.md') not display titles.

Use cases:
- Creating new pages
- Complete rewrites when most content changes
- Initializing pages with templates

After creating pages, update agents/index.md to add navigation entry.""",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Page file path (e.g., 'home.md', 'agents/index.md')"},
                        "content": {"type": "string", "description": "Complete page content in markdown format (no frontmatter)"},
                        "author": {"type": "string", "description": "Author name for git commit (default: 'AI Agent')"}
                    },
                    "required": ["path", "content"]
                },
                function=lambda args, w=wiki: _write_page(w, args)
            ),
            WikiTool(
                name="edit_page",
                description="""Edit a wiki page by replacing exact text matches. This is the primary tool for making targeted changes.

CRITICAL: The old_text must match EXACTLY including whitespace, newlines, and indentation. Use read_page first to see exact content.
IMPORTANT: Use the file path (e.g., 'home.md', 'agents/index.md') not display titles.

Behavior:
- Finds exact match of old_text in page content
- Replaces it with new_text
- Errors if old_text not found
- Errors if old_text matches multiple times (unless replace_all=true)

Tips:
- Include enough context in old_text to make it unique
- For multiple changes, make separate edit_page calls
- Use read_page to verify exact text before editing""",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Page file path (e.g., 'home.md', 'agents/index.md')"},
                        "old_text": {"type": "string", "description": "Exact text to find and replace (must be unique unless replace_all=true)"},
                        "new_text": {"type": "string", "description": "Replacement text"},
                        "replace_all": {"type": "boolean", "description": "Replace all occurrences (default: false - requires unique match)"},
                        "author": {"type": "string", "description": "Author name for git commit (default: 'AI Agent')"}
                    },
                    "required": ["path", "old_text", "new_text"]
                },
                function=lambda args, w=wiki: _edit_page(w, args)
            ),
            WikiTool(
                name="insert_at_line",
                description="""Insert content at a specific line number in a page.

The content is inserted BEFORE the specified line. Use this for:
- Adding new sections at specific positions
- Inserting content when exact text matching is difficult
- Adding content at the start (line 1) or end (line > total lines)

IMPORTANT: Use the file path (e.g., 'home.md', 'agents/skills.md') not display titles.
Note: Line numbers are 1-indexed (first line is 1).""",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Page file path (e.g., 'home.md', 'agents/skills.md')"},
                        "line": {"type": "integer", "description": "Line number to insert before (1-indexed). Use line > total_lines to append."},
                        "content": {"type": "string", "description": "Content to insert (can be multiple lines)"},
                        "author": {"type": "string", "description": "Author name for commit (default: 'AI Agent')"}
                    },
                    "required": ["path", "line", "content"]
                },
                function=lambda args, w=wiki: _insert_at_line(w, args)
            ),
            WikiTool(
                name="delete_page",
                description="""Delete a wiki page permanently.

IMPORTANT: This action cannot be undone! Use with caution.
IMPORTANT: Use the file path (e.g., 'home.md', 'agents/index.md') not display titles.

After deleting, consider updating agents/index.md to remove navigation entry.""",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Page file path to delete (e.g., 'home.md', 'agents/old-page.md')"},
                        "author": {"type": "string", "description": "Author name for git commit (default: 'AI Agent')"}
                    },
                    "required": ["path"]
                },
                function=lambda args, w=wiki: _delete_page(w, args)
            ),
            WikiTool(
                name="move",
                description="""Move/rename a wiki page (Unix mv command).

Use this to rename files, move them to different folders, or both in one operation. Supports Unicode characters and spaces.
IMPORTANT: Use the file path (e.g., 'home.md', 'agents/index.md') not display titles.

Examples:
- Rename in place: path='old-name.md', new_path='new-name.md'
- Move to folder: path='file.md', new_path='docs/file.md'
- Move + rename: path='old.md', new_path='docs/new.md'
- Rename in subfolder: path='docs/old.md', new_path='docs/new.md'

After moving/renaming, consider updating agents/index.md navigation entries.""",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Current path of the page"},
                        "new_path": {"type": "string", "description": "New path (can be different folder and/or filename)"},
                        "author": {"type": "string", "description": "Author name for git commit (default: 'AI Agent')"}
                    },
                    "required": ["path", "new_path"]
                },
                function=lambda args, w=wiki: _move(w, args)
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
                description="Create a worker thread to edit wiki pages. The thread works on its own git branch and can read/edit pages independently. User reviews changes when done.",
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Short kebab-case name (e.g., 'update-python-docs', 'fix-typos')"},
                        "goal": {"type": "string", "description": "Specific task description - be clear about what pages to edit and how"}
                    },
                    "required": ["name", "goal"]
                },
                function=lambda args, cb=spawn_callback: _spawn_thread(
                    cb, args)
            ),
            WikiTool(
                name="list_threads",
                description="List all threads with their status. Check this before spawning to avoid duplicates. Statuses: working, need_help, review, accepted, rejected.",
                parameters={
                    "type": "object",
                    "properties": {},
                    "required": []
                },
                function=lambda args, cb=list_callback: _list_threads(cb, args)
            )
        ]

    @staticmethod
    def worker_tools(
        help_callback: Callable[[str], None],
        review_callback: Callable[[str], None]
    ) -> List[WikiTool]:
        """Thread-specific tools: request_help, mark_for_review"""
        return [
            WikiTool(
                name="request_help",
                description="Ask the user for help. Use when stuck, need clarification, or unsure how to proceed. Pauses execution until user responds.",
                parameters={
                    "type": "object",
                    "properties": {
                        "question": {"type": "string", "description": "Specific question - explain what you tried and what you need"}
                    },
                    "required": ["question"]
                },
                function=lambda args, cb=help_callback: _request_help(cb, args)
            ),
            WikiTool(
                name="mark_for_review",
                description="Mark task complete for user review. User will accept (merge to main), request changes, or reject. Call this when you've finished your goal.",
                parameters={
                    "type": "object",
                    "properties": {
                        "summary": {"type": "string", "description": "Summary of what you changed - list pages edited and key modifications"}
                    },
                    "required": ["summary"]
                },
                function=lambda args, cb=review_callback: _mark_for_review(
                    cb, args)
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
            ToolBuilder.read_tools(wiki) +
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
            ToolBuilder.read_tools(wiki) +
            ToolBuilder.write_tools(wiki) +
            ToolBuilder.worker_tools(help_callback, review_callback)
        )
