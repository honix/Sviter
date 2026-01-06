"""
Thread capability mixins.

Mixins add specific capabilities to Thread classes:
- ReadToolsMixin: Read-only wiki tools (read_page, grep, glob, list)
- SpawnMixin: Ability to spawn worker threads
- BranchMixin: Git branch/worktree management
- EditToolsMixin: Page editing tools
- ReviewMixin: Review workflow (request_help, mark_for_review, accept/reject)
"""

from typing import List, Dict, Any, Optional, Callable, TYPE_CHECKING
import asyncio
from pathlib import Path

from ai.tools import ToolBuilder, WikiTool
from threads import git_operations as git_ops
from threads.accept_result import AcceptResult
from db import update_thread as db_update_thread

if TYPE_CHECKING:
    from storage.git_wiki import GitWiki
    from threads.base import ThreadStatus


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
    Adds review workflow capabilities.

    Tools: request_help, mark_for_review
    Methods: mark_for_review, accept, reject

    Used by worker threads to complete their lifecycle:
    WORKING -> REVIEW -> ACCEPTED/REJECTED
    """

    # These will be set by the class using this mixin
    review_summary: Optional[str] = None

    def get_tools(self, wiki: 'GitWiki', help_callback: Callable = None,
                  review_callback: Callable = None, **kwargs) -> List[WikiTool]:
        """Add lifecycle tools to the tool list."""
        parent_tools = super().get_tools(
            wiki, **kwargs) if hasattr(super(), 'get_tools') else []

        if help_callback is None or review_callback is None:
            return parent_tools

        return parent_tools + ToolBuilder.worker_tools(help_callback, review_callback)

    def mark_for_review(self, summary: str) -> None:
        """Mark this thread as ready for review."""
        from threads.base import ThreadStatus
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
        self.status = ThreadStatus.REVIEW
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
        from threads.base import ThreadStatus

        if not hasattr(self, 'branch') or not self.branch:
            return AcceptResult.ERROR

        if self.status != ThreadStatus.REVIEW:
            return AcceptResult.ERROR

        # Try to merge with author info
        print(f"🔀 Calling git_ops.merge_thread(wiki, {self.branch})")
        result = git_ops.merge_thread(wiki, self.branch, author=author, author_email=author_email)
        print(f"🔀 merge_thread result: {result}")

        if result["success"]:
            # Clean up worktree, keep branch for history
            if hasattr(self, 'cleanup_branch'):
                self.cleanup_branch(wiki, delete_branch=False)

            self.status = ThreadStatus.ACCEPTED
            db_update_thread(self.id, status='accepted')
            return AcceptResult.SUCCESS

        if result["conflict"]:
            return AcceptResult.CONFLICT

        self.error = f"Merge failed: {result['error']}"
        db_update_thread(self.id, error=self.error)
        return AcceptResult.ERROR

    def reject(self, wiki: 'GitWiki') -> bool:
        """
        Reject thread changes - cleanup worktree but keep branch for history.

        Args:
            wiki: Main GitWiki instance

        Returns:
            True if rejection successful
        """
        from threads.base import ThreadStatus

        # Clean up worktree, keep branch for history
        if hasattr(self, 'cleanup_branch'):
            self.cleanup_branch(wiki, delete_branch=False)

        self.status = ThreadStatus.REJECTED
        db_update_thread(self.id, status='rejected')
        return True

    def request_help_status(self) -> None:
        """Set thread status to need_help."""
        from threads.base import ThreadStatus

        self.status = ThreadStatus.NEED_HELP
        db_update_thread(self.id, status='need_help')

    def resume_working(self) -> None:
        """Resume working after help received."""
        from threads.base import ThreadStatus

        self.status = ThreadStatus.WORKING
        db_update_thread(self.id, status='working')

    def get_post_turn_action(self, result_status: str) -> Optional[Dict[str, Any]]:
        """
        Worker needs lifecycle tool if still working after turn.

        Returns prompt action if agent finished without calling
        request_help or mark_for_review.
        """
        from threads.base import ThreadStatus

        if self.status == ThreadStatus.WORKING and result_status in ('completed', 'stopped'):
            return {
                "type": "prompt",
                "message": (
                    "You finished responding but didn't use a lifecycle tool. "
                    "Please either:\n"
                    "- Call `mark_for_review` if your task is complete\n"
                    "- Call `request_help` if you need clarification or are stuck\n\n"
                    "You must use one of these tools to proceed."
                )
            }
        return None

    def prepare_callbacks(self, broadcast_fn=None, send_thread_list_fn=None, **kwargs) -> Dict[str, Any]:
        """
        Prepare callbacks for worker thread lifecycle tools.

        Creates help_callback and review_callback that update thread status
        and broadcast notifications.
        """
        async def on_status_change(status: str, message: str):
            if broadcast_fn:
                await broadcast_fn({
                    "type": "thread_status",
                    "thread_id": self.id,
                    "status": status,
                    "message": message
                })
            if send_thread_list_fn:
                await send_thread_list_fn()

        def on_request_help(question: str):
            self.request_help_status()
            asyncio.create_task(on_status_change("need_help", question))

        def on_mark_for_review(summary: str):
            self.mark_for_review(summary)
            asyncio.create_task(on_status_change("review", summary))

        return {
            "help_callback": on_request_help,
            "review_callback": on_mark_for_review
        }
