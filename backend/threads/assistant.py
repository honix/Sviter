"""
AssistantThread - Read-only assistant that operates on main branch.

Capabilities:
- Read wiki pages (ReadToolsMixin)
- Spawn worker threads (SpawnMixin)

Does NOT have:
- Edit capabilities (must spawn workers for edits)
- Own git branch (operates on main)
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Callable, TYPE_CHECKING
from datetime import datetime

from threads.base import Thread, ThreadType, ThreadStatus, ThreadMessage
from threads.mixins import ReadToolsMixin, SpawnMixin
from ai.prompts import ASSISTANT_PROMPT
from ai.tools import WikiTool
from db import (
    create_thread as db_create_thread,
    get_thread as db_get_thread,
    update_thread as db_update_thread,
    get_user_assistant_thread,
)
import uuid

if TYPE_CHECKING:
    from storage.git_wiki import GitWiki


@dataclass
class AssistantThread(ReadToolsMixin, SpawnMixin, Thread):
    """
    Read-only assistant thread.

    - Operates on main branch (no dedicated branch/worktree)
    - Can read wiki pages
    - Can spawn worker threads for editing
    - One active assistant per user (can have archived ones)
    """

    @classmethod
    def create(cls, owner_id: str) -> 'AssistantThread':
        """Create a new assistant thread for a user."""
        thread_id = str(uuid.uuid4())
        now = datetime.now()

        # Generate consistent name: user-{owner_id[:6]}-assistant
        thread_name = f"user-{owner_id[:6]}-assistant"

        # Create in database
        db_create_thread(
            thread_id=thread_id,
            thread_type='assistant',
            name=thread_name,
            owner_id=owner_id,
            status='active',
            goal=None,
            branch=None,
            worktree_path=None
        )

        return cls(
            id=thread_id,
            name=thread_name,
            type=ThreadType.ASSISTANT,
            owner_id=owner_id,
            status=ThreadStatus.ACTIVE,
            created_at=now,
            updated_at=now,
            goal=None,
            error=None,
            is_generating=False
        )

    @classmethod
    def get_or_create_for_user(cls, owner_id: str) -> 'AssistantThread':
        """
        Get existing active assistant thread or create a new one.

        Each user has at most one active assistant thread.
        """
        existing = get_user_assistant_thread(owner_id)
        if existing:
            return cls.from_dict(existing)
        return cls.create(owner_id)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'AssistantThread':
        """Create AssistantThread from database row dict."""
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
            type=ThreadType.ASSISTANT,
            owner_id=data['owner_id'],
            status=ThreadStatus(data['status']),
            created_at=created_at,
            updated_at=updated_at,
            goal=data.get('goal'),
            error=data.get('error'),
            is_generating=bool(data.get('is_generating', False))
        )

    def get_prompt(self) -> str:
        """Get system prompt for assistant."""
        return ASSISTANT_PROMPT

    def get_tools(self, wiki: 'GitWiki', spawn_callback: Callable = None,
                  list_callback: Callable = None, **kwargs) -> List[WikiTool]:
        """
        Get tools for assistant: read + spawn.

        Args:
            wiki: GitWiki instance (main wiki on main branch)
            spawn_callback: Callback to spawn worker threads
            list_callback: Callback to list threads

        Returns:
            List of WikiTool instances
        """
        tools = []

        # Add read tools via mixin
        tools.extend(ReadToolsMixin.get_tools(self, wiki))

        # Add spawn tools via mixin (if callbacks provided)
        if spawn_callback and list_callback:
            from ai.tools import ToolBuilder
            tools.extend(ToolBuilder.main_tools(spawn_callback, list_callback))

        return tools

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        base = super().to_dict()
        base['thread_type'] = 'assistant'  # Frontend compatibility
        return base

    def archive(self) -> None:
        """Archive this assistant thread."""
        self.status = ThreadStatus.ARCHIVED
        db_update_thread(self.id, status='archived')

    def can_be_archived(self) -> bool:
        """Check if thread can be archived (not already archived)."""
        return self.status != ThreadStatus.ARCHIVED

    # ─────────────────────────────────────────────────────────────────────────
    # Thread Behavior Interface (for manager uniformity)
    # ─────────────────────────────────────────────────────────────────────────

    def prepare_callbacks(self, spawn_callback=None, list_callback=None, **kwargs) -> Dict[str, Any]:
        """
        Prepare callbacks for assistant thread tools.

        Args:
            spawn_callback: Function to spawn worker threads
            list_callback: Function to list threads

        Returns:
            Dict of callback kwargs for get_tools()
        """
        return {
            "spawn_callback": spawn_callback,
            "list_callback": list_callback
        }
