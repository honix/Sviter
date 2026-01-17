"""
WorkerThread - Autonomous worker that operates on its own git branch.

Capabilities:
- Read wiki pages (ReadToolsMixin)
- Edit wiki pages (EditToolsMixin)
- Git branch/worktree management (BranchMixin)
- Review workflow (ReviewMixin)

Lifecycle:
CREATED -> ... (agent sets status freely) -> REVIEW -> ACCEPTED
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Callable, TYPE_CHECKING
from datetime import datetime
import uuid
import re

from threads.base import Thread, ThreadType, TERMINAL_STATUSES
from threads.mixins import ReadToolsMixin, BranchMixin, EditToolsMixin, ReviewMixin
from ai.prompts import THREAD_PROMPT
from ai.tools import WikiTool
from db import (
    create_thread as db_create_thread,
    update_thread as db_update_thread,
)

if TYPE_CHECKING:
    from storage.git_wiki import GitWiki


@dataclass
class WorkerThread(ReadToolsMixin, BranchMixin, EditToolsMixin, ReviewMixin, Thread):
    """
    Worker thread with full wiki access.

    Features:
    - Has its own git branch and worktree
    - Can read and edit wiki pages
    - Goes through review workflow before changes are merged
    - Multiple workers can run concurrently
    - AI adapts to conversation: active when alone, listens when multiple participants
    """

    # BranchMixin fields
    branch: Optional[str] = None
    worktree_path: Optional[str] = None

    # ReviewMixin fields
    review_summary: Optional[str] = None

    @classmethod
    def create(cls, owner_id: str, name: str, goal: str = "") -> 'WorkerThread':
        """
        Create a new worker thread.

        Args:
            owner_id: User who created this thread
            name: Short name for the thread (e.g., "fix-typos")
            goal: Optional task description (stored for reference)

        Returns:
            WorkerThread instance (branch/worktree not yet created)
        """
        thread_id = str(uuid.uuid4())
        now = datetime.now()

        # Generate branch name and derive thread name from it (with hash for uniqueness)
        branch = cls._generate_branch_name(name, thread_id)
        # Name matches branch without thread/ prefix: "add-hello-world-tsx-e5e491"
        thread_name = branch.replace('thread/', '')

        # Create in database
        db_create_thread(
            thread_id=thread_id,
            thread_type='worker',
            name=thread_name,
            owner_id=owner_id,
            status='Just created',  # Initial status, agent sets freely
            goal=goal,
            branch=branch,
            worktree_path=None  # Created later by create_branch()
        )

        return cls(
            id=thread_id,
            name=thread_name,
            type=ThreadType.WORKER,
            owner_id=owner_id,
            status="created",  # String status
            created_at=now,
            updated_at=now,
            goal=goal,
            branch=branch,
            worktree_path=None,
            review_summary=None,
            error=None,
            is_generating=False
        )

    @staticmethod
    def _generate_branch_name(name: str, thread_id: str) -> str:
        """Generate a safe git branch name."""
        # Sanitize name (alphanumeric, hyphens only)
        safe_name = re.sub(r'[^a-zA-Z0-9-]', '-', name.lower())
        safe_name = re.sub(r'-+', '-', safe_name)  # Collapse multiple dashes
        safe_name = re.sub(r'^-+|-+$', '', safe_name)  # Remove leading/trailing

        # Git safety validations
        if not safe_name or safe_name.startswith('/') or safe_name.endswith('.lock'):
            safe_name = "task"

        # Reasonable length
        if len(safe_name) > 50:
            safe_name = safe_name[:50].rstrip('-')

        # Short UUID for uniqueness
        short_uuid = thread_id[:6]

        return f"thread/{safe_name}-{short_uuid}"

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'WorkerThread':
        """Create WorkerThread from database row dict."""
        created_at = data.get('created_at')
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        elif not isinstance(created_at, datetime):
            created_at = datetime.now()

        updated_at = data.get('updated_at')
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at)
        elif not isinstance(updated_at, datetime):
            updated_at = datetime.now()

        return cls(
            id=data['id'],
            name=data['name'],
            type=ThreadType.WORKER,
            owner_id=data['owner_id'],
            status=data['status'],  # String status
            created_at=created_at,
            updated_at=updated_at,
            goal=data.get('goal'),
            branch=data.get('branch'),
            worktree_path=data.get('worktree_path'),
            review_summary=data.get('review_summary'),
            error=data.get('error'),
            is_generating=bool(data.get('is_generating', False))
        )

    def get_prompt(self) -> str:
        """Get system prompt for worker."""
        return THREAD_PROMPT.format(branch=self.branch or "")

    def get_tools(self, wiki: 'GitWiki' = None, broadcast_fn: Callable = None, **kwargs) -> List[WikiTool]:
        """
        Get tools for worker: read + edit + thread info.

        Args:
            wiki: GitWiki instance (should be this thread's worktree wiki)
            broadcast_fn: Function to broadcast messages

        Returns:
            List of WikiTool instances
        """
        # Use worktree wiki if no wiki provided
        if wiki is None:
            wiki = self.get_wiki()
            if wiki is None:
                return []

        # Use mixin chain to get tools
        return super().get_tools(wiki, broadcast_fn=broadcast_fn, **kwargs)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        base = super().to_dict()
        base.update({
            'thread_type': 'worker',  # Frontend compatibility
            'branch': self.branch,
            'worktree_path': self.worktree_path,
            'review_summary': self.review_summary,
        })
        return base

    def initialize_branch(self, wiki: 'GitWiki') -> Optional[str]:
        """
        Initialize git branch and worktree.

        Should be called after create() before starting execution.

        Args:
            wiki: Main GitWiki instance

        Returns:
            Error message if failed, None on success
        """
        return self.create_branch(wiki)

    def is_working(self) -> bool:
        """Check if thread is actively working (not finished)."""
        return self.status not in TERMINAL_STATUSES

    def is_waiting_for_input(self) -> bool:
        """Check if thread is waiting for user input."""
        return self.status in ("need_help", "review")

    def is_finished(self) -> bool:
        """Check if thread lifecycle is complete."""
        return self.status in TERMINAL_STATUSES

    def rename_with_branch(self, name: str, wiki: 'GitWiki') -> Optional[str]:
        """
        Rename thread and its git branch.

        Args:
            name: New thread name (will be sanitized for branch name)
            wiki: Main GitWiki instance

        Returns:
            Error message if failed, None on success
        """
        from threads.git_operations import rename_branch

        # Generate new branch name (keeping the same hash for uniqueness)
        old_branch = self.branch
        if not old_branch:
            # No branch, just rename the thread
            self.rename(name)
            return None

        # Extract the hash from old branch name (last part after -)
        # e.g., "thread/old-name-abc123" -> "abc123"
        old_parts = old_branch.split('-')
        hash_suffix = old_parts[-1] if old_parts else self.id[:6]

        # Generate new branch name
        new_branch = self._generate_branch_name(name, hash_suffix)

        if new_branch == old_branch:
            # Same name, just update thread name
            self.rename(name)
            return None

        # Rename the git branch
        result = rename_branch(wiki, old_branch, new_branch, self.worktree_path)

        if not result["success"]:
            return f"Failed to rename branch: {result['error']}"

        # Update thread state
        self.branch = new_branch
        if result["new_worktree_path"]:
            self.worktree_path = result["new_worktree_path"]

        # Update name in database (branch is updated too)
        self.name = name
        db_update_thread(
            self.id,
            name=name,
            branch=new_branch,
            worktree_path=self.worktree_path
        )

        return None

    def can_accept(self) -> bool:
        """Check if thread can be accepted (any non-terminal state)."""
        return self.status not in TERMINAL_STATUSES

    # ─────────────────────────────────────────────────────────────────────────
    # Thread Behavior Interface (for manager uniformity)
    # ─────────────────────────────────────────────────────────────────────────

    def get_initial_message(self) -> Optional[str]:
        """Threads always wait for user's first message."""
        return None
