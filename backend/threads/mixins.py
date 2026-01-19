"""
Thread capability mixins.

Mixins add specific capabilities to Thread classes:
- ReadToolsMixin: Read-only wiki tools (read_page, grep, glob, list)
- SpawnMixin: Ability to spawn worker threads
- BranchMixin: Git branch/worktree management
- EditToolsMixin: Page editing tools
- ReviewMixin: Thread info tools (get/set status and name) + accept workflow
- ThreadAgentToolsMixin: Thread analysis tools (list_threads_filtered, read_thread, search_threads, thread_diff)
"""

from typing import List, Dict, Any, Optional, Callable, TYPE_CHECKING
from pathlib import Path

from ai.tools import ToolBuilder, WikiTool
from threads import git_operations as git_ops
from threads.accept_result import AcceptResult
from db import (
    update_thread as db_update_thread,
    get_thread as db_get_thread,
    get_thread_messages as db_get_thread_messages,
    search_thread_messages as db_search_thread_messages,
)

if TYPE_CHECKING:
    from storage.git_wiki import GitWiki


class ReadToolsMixin:
    """
    Adds read-only wiki tools.

    Tools: read_page, grep_pages, glob_pages, list_pages
    """

    def get_tools(self, wiki: 'GitWiki', **kwargs) -> List[WikiTool]:
        """Add read tools to the tool list."""
        parent_tools = super().get_tools(
            wiki, **kwargs) if hasattr(super(), 'get_tools') else []
        return parent_tools + ToolBuilder.read_tools(wiki)


class SpawnMixin:
    """
    Adds ability to spawn worker threads.

    Tools: spawn_thread, list_threads
    Used by assistant threads to delegate editing tasks.
    """

    def get_tools(self, wiki: 'GitWiki', spawn_callback: Callable = None,
                  list_callback: Callable = None, **kwargs) -> List[WikiTool]:
        """Add spawn/list tools to the tool list."""
        parent_tools = super().get_tools(
            wiki, **kwargs) if hasattr(super(), 'get_tools') else []

        if spawn_callback is None or list_callback is None:
            # Can't add spawn tools without callbacks
            return parent_tools

        return parent_tools + ToolBuilder.main_tools(spawn_callback, list_callback)


class BranchMixin:
    """
    Adds git branch and worktree capabilities.

    Worker threads use this to work on isolated git branches
    with dedicated worktrees for concurrent execution.
    """

    # These will be set by the class using this mixin
    branch: Optional[str] = None
    worktree_path: Optional[str] = None

    def create_branch(self, wiki: 'GitWiki') -> Optional[str]:
        """
        Create git branch and worktree for this thread.

        Returns error message if failed, None on success.
        """
        if not self.branch:
            return "No branch name set"

        # Create git branch from main
        error = git_ops.prepare_branch(wiki, self.branch)
        if error:
            return error

        # Create worktree for concurrent execution
        try:
            worktree_path = git_ops.create_worktree(wiki, self.branch)
            self.worktree_path = str(worktree_path)

            # Persist to database
            db_update_thread(self.id, branch=self.branch,
                             worktree_path=self.worktree_path)
            return None

        except Exception as e:
            # Clean up branch if worktree creation failed
            git_ops.delete_thread_branch(wiki, self.branch)
            return f"Failed to create worktree: {e}"

    def cleanup_branch(self, wiki: 'GitWiki', delete_branch: bool = False) -> bool:
        """
        Clean up worktree (and optionally branch).

        Args:
            wiki: Main GitWiki instance
            delete_branch: If True, also delete the branch

        Returns:
            True if cleanup successful
        """
        if not self.branch:
            return True

        # Remove worktree first
        worktree_removed = git_ops.remove_worktree(wiki, self.branch)

        if delete_branch and worktree_removed:
            git_ops.delete_thread_branch(wiki, self.branch)

        return worktree_removed

    def get_wiki(self) -> Optional['GitWiki']:
        """
        Get GitWiki instance for this thread's worktree.

        Returns None if no worktree exists.
        """
        if not self.worktree_path:
            return None

        from storage.git_wiki import GitWiki
        try:
            return GitWiki(self.worktree_path)
        except Exception:
            return None

    def get_diff_stats(self, wiki: 'GitWiki') -> Optional[Dict[str, Any]]:
        """Get diff statistics between main and this thread's branch."""
        if not self.branch:
            return None
        return git_ops.get_diff_stats(wiki, self.branch)


class EditToolsMixin:
    """
    Adds page editing tools.

    Tools: write_page, edit_page, insert_at_line
    Used by worker threads to modify wiki content.
    """

    def get_tools(self, wiki: 'GitWiki', **kwargs) -> List[WikiTool]:
        """Add edit tools to the tool list."""
        parent_tools = super().get_tools(
            wiki, **kwargs) if hasattr(super(), 'get_tools') else []
        return parent_tools + ToolBuilder.write_tools(wiki)


class ReviewMixin:
    """
    Adds thread info tools and accept workflow.

    Tools: get/set_thread_status, get/set_thread_name
    Methods: accept, rename

    User accepts the thread to merge changes to main.
    """

    # These will be set by the class using this mixin
    review_summary: Optional[str] = None

    def get_tools(self, wiki: 'GitWiki', broadcast_fn: Callable = None, **kwargs) -> List[WikiTool]:
        """Add thread info tools to the tool list."""
        parent_tools = super().get_tools(
            wiki, **kwargs) if hasattr(super(), 'get_tools') else []

        return parent_tools + ToolBuilder.worker_tools(
            thread=self,
            broadcast_fn=broadcast_fn,
            wiki=wiki
        )

    def mark_for_review(self, summary: str) -> None:
        """Mark this thread as ready for review."""
        from pathlib import Path

        # Commit any pending merge before marking for review
        wiki = self.get_wiki()
        if wiki:
            # Use repo.git_dir for worktrees (wiki.repo_path / '.git' is a file in worktrees)
            git_dir = Path(wiki.repo.git_dir)
            merge_head = git_dir / 'MERGE_HEAD'
            if merge_head.exists():
                try:
                    # Use git commit directly to properly complete the merge
                    # index.commit() doesn't handle merge state correctly
                    wiki.repo.git.commit("-m", f"Merge main into {self.branch} (conflict resolved)")
                    print(f"✅ Committed merge resolution for {self.branch}")
                except Exception as e:
                    # Log but don't fail - maybe there are still conflicts
                    import logging
                    logging.getLogger(__name__).warning(f"Failed to commit merge: {e}")

        self.review_summary = summary
        self.status = "review"
        db_update_thread(self.id, status='review', review_summary=summary)

    def accept(self, wiki: 'GitWiki', author: str = "System",
               author_email: Optional[str] = None) -> AcceptResult:
        """
        Accept thread changes - merge to main.

        Args:
            wiki: Main GitWiki instance (not worktree)
            author: Author name for the merge commit
            author_email: Author's email for the merge commit

        Returns:
            AcceptResult indicating success, conflict, or error
        """
        from threads.base import TERMINAL_STATUSES

        if not hasattr(self, 'branch') or not self.branch:
            return AcceptResult.ERROR

        # Allow accept from any non-terminal state
        if self.status in TERMINAL_STATUSES:
            return AcceptResult.ERROR

        # Try to merge with author info
        print(f"🔀 Calling git_ops.merge_thread(wiki, {self.branch})")
        result = git_ops.merge_thread(wiki, self.branch, author=author, author_email=author_email)
        print(f"🔀 merge_thread result: {result}")

        if result["success"]:
            # Clean up worktree, keep branch for history
            if hasattr(self, 'cleanup_branch'):
                self.cleanup_branch(wiki, delete_branch=False)

            self.status = "accepted"
            db_update_thread(self.id, status='accepted')
            return AcceptResult.SUCCESS

        if result["conflict"]:
            return AcceptResult.CONFLICT

        self.error = f"Merge failed: {result['error']}"
        db_update_thread(self.id, error=self.error)
        return AcceptResult.ERROR

    def rename(self, name: str, status: str = None) -> None:
        """Rename thread and optionally update status."""
        self.name = name
        if status:
            self.status = status
        db_update_thread(self.id, name=name, status=status if status else self.status)

    def prepare_callbacks(self, broadcast_fn=None, list_callback=None, **kwargs) -> Dict[str, Any]:
        """Prepare callbacks for worker thread tools."""
        result = {"broadcast_fn": broadcast_fn}
        # Pass through list_callback for thread agent tools
        if list_callback:
            result["list_threads_callback"] = list_callback
        return result


class ThreadAgentToolsMixin:
    """
    Adds thread analysis and search tools.

    Tools: list_threads_filtered, read_thread, search_threads, thread_diff
    Used by both assistant and worker threads to analyze thread history and find information.
    """

    def get_tools(self, wiki: 'GitWiki', list_threads_callback: Callable = None, **kwargs) -> List[WikiTool]:
        """Add thread agent tools to the tool list."""
        parent_tools = super().get_tools(
            wiki, **kwargs) if hasattr(super(), 'get_tools') else []

        if list_threads_callback is None:
            # Can't add thread tools without callbacks
            return parent_tools

        # Create callbacks for thread tools
        def get_thread_callback(thread_id: str) -> Optional[Dict[str, Any]]:
            return db_get_thread(thread_id)

        def get_messages_callback(thread_id: str, limit: int, offset: int) -> List[Dict[str, Any]]:
            return db_get_thread_messages(thread_id, limit, offset)

        def search_callback(pattern: str, user_filter: Optional[str]) -> List[Dict[str, Any]]:
            return db_search_thread_messages(pattern, user_filter)

        return parent_tools + ToolBuilder.thread_agent_tools(
            get_thread_callback=get_thread_callback,
            get_messages_callback=get_messages_callback,
            list_threads_callback=list_threads_callback,
            search_callback=search_callback,
            wiki=wiki
        )
