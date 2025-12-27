"""
WorkerThread - Autonomous worker that operates on its own git branch.

Capabilities:
- Read wiki pages (ReadToolsMixin)
- Edit wiki pages (EditToolsMixin)
- Git branch/worktree management (BranchMixin)
- Review workflow (ReviewMixin)

Lifecycle:
WORKING -> NEED_HELP (optional) -> REVIEW -> ACCEPTED/REJECTED
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Callable, TYPE_CHECKING
from datetime import datetime
import uuid
import re

from threads.base import Thread, ThreadType, ThreadStatus, ThreadMessage
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
    Autonomous worker thread with full wiki access.

    - Has its own git branch and worktree
    - Can read and edit wiki pages
    - Goes through review workflow before changes are merged
    - Multiple workers can run concurrently
    """

    # BranchMixin fields
    branch: Optional[str] = None
    worktree_path: Optional[str] = None

    # ReviewMixin fields
    review_summary: Optional[str] = None

    @classmethod
    def create(cls, owner_id: str, name: str, goal: str) -> 'WorkerThread':
        """
        Create a new worker thread.

        Args:
            owner_id: User who created this thread
            name: Short name for the thread (e.g., "fix-typos")
            goal: Task description

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
            status='working',
            goal=goal,
            branch=branch,
            worktree_path=None  # Created later by create_branch()
        )

        return cls(
            id=thread_id,
            name=thread_name,
            type=ThreadType.WORKER,
            owner_id=owner_id,
            status=ThreadStatus.WORKING,
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
            status=ThreadStatus(data['status']),
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
        return THREAD_PROMPT.format(goal=self.goal or "", branch=self.branch or "")

    def get_tools(self, wiki: 'GitWiki' = None, help_callback: Callable = None,
                  review_callback: Callable = None, **kwargs) -> List[WikiTool]:
        """
        Get tools for worker: read + edit + lifecycle.

        Args:
            wiki: GitWiki instance (should be this thread's worktree wiki)
            help_callback: Callback when agent requests help
            review_callback: Callback when agent marks for review

        Returns:
            List of WikiTool instances
        """
        # Use worktree wiki if no wiki provided
        if wiki is None:
            wiki = self.get_wiki()
            if wiki is None:
                return []

        # Use mixin chain to get tools (ReadToolsMixin + EditToolsMixin + ReviewMixin)
        # Pass callbacks through kwargs for ReviewMixin
        return super().get_tools(
            wiki,
            help_callback=help_callback,
            review_callback=review_callback,
            **kwargs
        )

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
        """Check if thread is actively working."""
        return self.status == ThreadStatus.WORKING

    def is_waiting_for_input(self) -> bool:
        """Check if thread is waiting for user input."""
        return self.status in (ThreadStatus.NEED_HELP, ThreadStatus.REVIEW)

    def is_finished(self) -> bool:
        """Check if thread lifecycle is complete."""
        return self.status in (ThreadStatus.ACCEPTED, ThreadStatus.REJECTED)

    def can_accept(self) -> bool:
        """Check if thread can be accepted."""
        return self.status == ThreadStatus.REVIEW

    def can_reject(self) -> bool:
        """Check if thread can be rejected."""
        return self.status in (ThreadStatus.REVIEW, ThreadStatus.WORKING, ThreadStatus.NEED_HELP)

    # ─────────────────────────────────────────────────────────────────────────
    # Thread Behavior Interface (for manager uniformity)
    # ─────────────────────────────────────────────────────────────────────────

    def get_initial_message(self) -> Optional[str]:
        """Initial message to start worker execution with goal."""
        return f"Your goal: {self.goal}\n\nBegin working on this task."
