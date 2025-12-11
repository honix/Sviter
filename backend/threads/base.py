"""
Base Thread class - the unified conversation container.

All conversations (assistant and worker) are Threads with different capabilities
added via mixins.
"""

from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
from typing import List, Dict, Any, Optional
import uuid

from db import (
    create_thread as db_create_thread,
    get_thread as db_get_thread,
    update_thread as db_update_thread,
    delete_thread as db_delete_thread,
    add_thread_message,
    get_thread_messages,
)


class ThreadType(Enum):
    """Type of thread."""
    ASSISTANT = "assistant"  # Read-only assistant (operates on main branch)
    WORKER = "worker"        # Autonomous worker with edit capabilities (own branch)


class ThreadStatus(Enum):
    """Status of a thread."""
    # Shared (all threads)
    ACTIVE = "active"        # Currently usable
    ARCHIVED = "archived"    # User archived

    # Worker-only statuses
    WORKING = "working"      # Agent actively processing
    NEED_HELP = "need_help"  # Agent stuck, needs user input
    REVIEW = "review"        # Agent done, changes ready for review
    ACCEPTED = "accepted"    # Changes merged to main
    REJECTED = "rejected"    # Changes rejected


@dataclass
class ThreadMessage:
    """A single message in thread conversation."""
    id: str
    role: str  # "user", "assistant", "system", "tool_call"
    content: str
    created_at: datetime
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_result: Optional[str] = None
    user_id: Optional[str] = None  # Who sent this message

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else self.created_at,
            "tool_name": self.tool_name,
            "tool_args": self.tool_args,
            "tool_result": self.tool_result,
            "user_id": self.user_id
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ThreadMessage':
        """Create from database row dict."""
        created_at = data.get('created_at')
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        elif not isinstance(created_at, datetime):
            created_at = datetime.now()

        return cls(
            id=data['id'],
            role=data['role'],
            content=data['content'],
            created_at=created_at,
            tool_name=data.get('tool_name'),
            tool_args=data.get('tool_args'),
            tool_result=data.get('tool_result'),
            user_id=data.get('user_id')
        )


@dataclass
class Thread:
    """
    Base Thread class - unified conversation container.

    Both assistant and worker threads inherit from this.
    Capabilities are added via mixins (ReadToolsMixin, SpawnMixin, etc.)
    """
    id: str
    name: str
    type: ThreadType
    owner_id: str
    status: ThreadStatus
    created_at: datetime
    updated_at: datetime

    # Optional fields
    goal: Optional[str] = None  # Worker threads have goals
    error: Optional[str] = None
    is_generating: bool = False

    # In-memory message cache (loaded on demand)
    _messages: Optional[List[ThreadMessage]] = field(default=None, repr=False)

    @classmethod
    def create(cls, thread_type: ThreadType, name: str, owner_id: str,
               status: ThreadStatus = None, goal: str = None, **kwargs) -> 'Thread':
        """Factory method to create and persist a new thread."""
        thread_id = str(uuid.uuid4())
        now = datetime.now()

        # Default status based on type
        if status is None:
            status = ThreadStatus.ACTIVE if thread_type == ThreadType.ASSISTANT else ThreadStatus.WORKING

        # Create in database
        db_create_thread(
            thread_id=thread_id,
            thread_type=thread_type.value,
            name=name,
            owner_id=owner_id,
            status=status.value,
            goal=goal,
            branch=kwargs.get('branch'),
            worktree_path=kwargs.get('worktree_path')
        )

        return cls(
            id=thread_id,
            name=name,
            type=thread_type,
            owner_id=owner_id,
            status=status,
            created_at=now,
            updated_at=now,
            goal=goal,
            **{k: v for k, v in kwargs.items() if k in ('error', 'is_generating')}
        )

    @classmethod
    def load(cls, thread_id: str) -> Optional['Thread']:
        """Load thread from database."""
        data = db_get_thread(thread_id)
        if not data:
            return None
        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Thread':
        """Create Thread from database row dict."""
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
            type=ThreadType(data['type']),
            owner_id=data['owner_id'],
            status=ThreadStatus(data['status']),
            created_at=created_at,
            updated_at=updated_at,
            goal=data.get('goal'),
            error=data.get('error'),
            is_generating=bool(data.get('is_generating', False))
        )

    def save(self) -> None:
        """Persist thread changes to database."""
        db_update_thread(
            self.id,
            name=self.name,
            status=self.status.value,
            goal=self.goal,
            error=self.error,
            is_generating=self.is_generating
        )

    def delete(self) -> bool:
        """Delete thread from database."""
        return db_delete_thread(self.id)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type.value,
            "owner_id": self.owner_id,
            "status": self.status.value,
            "goal": self.goal,
            "created_at": self.created_at.isoformat() if isinstance(self.created_at, datetime) else self.created_at,
            "updated_at": self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else self.updated_at,
            "error": self.error,
            "is_generating": self.is_generating,
            "message_count": len(self.messages) if self._messages is not None else 0
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Message Management
    # ─────────────────────────────────────────────────────────────────────────

    @property
    def messages(self) -> List[ThreadMessage]:
        """Get messages (loads from DB on first access)."""
        if self._messages is None:
            self._messages = self._load_messages()
        return self._messages

    def _load_messages(self) -> List[ThreadMessage]:
        """Load messages from database."""
        rows = get_thread_messages(self.id)
        return [ThreadMessage.from_dict(row) for row in rows]

    def add_message(self, role: str, content: str, **kwargs) -> ThreadMessage:
        """Add a message to the conversation."""
        message_id = str(uuid.uuid4())

        # Save to database
        add_thread_message(
            message_id=message_id,
            thread_id=self.id,
            role=role,
            content=content,
            tool_name=kwargs.get('tool_name'),
            tool_args=kwargs.get('tool_args'),
            tool_result=kwargs.get('tool_result'),
            user_id=kwargs.get('user_id')
        )

        # Create message object
        message = ThreadMessage(
            id=message_id,
            role=role,
            content=content,
            created_at=datetime.now(),
            **{k: v for k, v in kwargs.items() if k in ('tool_name', 'tool_args', 'tool_result', 'user_id')}
        )

        # Add to cache if loaded
        if self._messages is not None:
            self._messages.append(message)

        self.updated_at = datetime.now()
        return message

    def reload_messages(self) -> None:
        """Force reload messages from database."""
        self._messages = self._load_messages()

    # ─────────────────────────────────────────────────────────────────────────
    # Status Management
    # ─────────────────────────────────────────────────────────────────────────

    def set_status(self, status: ThreadStatus) -> None:
        """Update thread status."""
        self.status = status
        self.updated_at = datetime.now()
        db_update_thread(self.id, status=status.value)

    def set_error(self, error: str) -> None:
        """Set error message."""
        self.error = error
        self.updated_at = datetime.now()
        db_update_thread(self.id, error=error)

    def set_generating(self, is_generating: bool) -> None:
        """Set generating state."""
        self.is_generating = is_generating
        db_update_thread(self.id, is_generating=is_generating)

    def is_finished(self) -> bool:
        """Check if thread is in a terminal state (no more interaction possible)."""
        return self.status in (ThreadStatus.ACCEPTED, ThreadStatus.REJECTED, ThreadStatus.ARCHIVED)

    # ─────────────────────────────────────────────────────────────────────────
    # Tool Methods (to be overridden by mixins)
    # ─────────────────────────────────────────────────────────────────────────

    def get_tools(self, wiki, **kwargs) -> List:
        """Get tools for this thread. Override in mixins."""
        return []

    def get_prompt(self) -> str:
        """Get system prompt for this thread. Override in subclasses."""
        return ""

    # ─────────────────────────────────────────────────────────────────────────
    # Thread Behavior Interface (for manager uniformity)
    # ─────────────────────────────────────────────────────────────────────────

    def get_post_turn_action(self, result_status: str) -> Optional[Dict[str, Any]]:
        """
        Called after each agent turn. Returns action to take.

        Override in mixins/subclasses to customize behavior.

        Returns:
            None - no action needed
            {"type": "prompt", "message": "..."} - send follow-up prompt
            {"type": "stop"} - stop execution
        """
        return None  # Default: no post-turn action

    def get_initial_message(self) -> Optional[str]:
        """Initial message to kick off thread execution. None means wait for user."""
        return None

    def starts_with_initial_message(self) -> bool:
        """Whether thread starts with an initial message (vs waiting for user)."""
        return self.get_initial_message() is not None

    def prepare_callbacks(self, broadcast_fn=None, send_thread_list_fn=None) -> Dict[str, Any]:
        """
        Prepare callbacks for this thread's tools.

        Args:
            broadcast_fn: Async function to broadcast messages
            send_thread_list_fn: Async function to send thread list

        Returns:
            Dict of callback kwargs for get_tools()
        """
        return {}

    # ─────────────────────────────────────────────────────────────────────────
    # Review Interface (overridden by ReviewMixin/WorkerThread)
    # ─────────────────────────────────────────────────────────────────────────

    def can_accept(self) -> bool:
        """Check if thread changes can be accepted. Override in subclasses."""
        return False

    def accept(self, wiki) -> 'AcceptResult':
        """Accept thread changes. Override in subclasses."""
        from threads.accept_result import AcceptResult
        return AcceptResult.ERROR

    def can_reject(self) -> bool:
        """Check if thread can be rejected. Override in subclasses."""
        return False

    def reject(self, wiki) -> bool:
        """Reject thread changes. Override in subclasses."""
        return False

    def get_diff_stats(self, wiki) -> Optional[Dict[str, Any]]:
        """Get diff statistics for this thread. Override in subclasses."""
        return None
