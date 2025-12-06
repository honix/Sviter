"""
Thread models for the wiki agent system.

A Thread represents an autonomous agent working on a git branch.
"""

from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime
from typing import List, Dict, Any, Optional
import uuid
import re


class ThreadStatus(Enum):
    """Status of a thread."""
    WORKING = "working"      # Agent actively processing
    NEED_HELP = "need_help"  # Agent stuck, needs user input
    REVIEW = "review"        # Agent done, changes ready for review


@dataclass
class ThreadMessage:
    """A single message in thread conversation."""
    id: str
    role: str  # "user", "assistant", "system", "tool_call"
    content: str
    timestamp: datetime
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_result: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp.isoformat(),
            "tool_name": self.tool_name,
            "tool_args": self.tool_args,
            "tool_result": self.tool_result
        }

    @classmethod
    def create(cls, role: str, content: str, **kwargs) -> 'ThreadMessage':
        return cls(
            id=str(uuid.uuid4()),
            role=role,
            content=content,
            timestamp=datetime.now(),
            **kwargs
        )


@dataclass
class Thread:
    """
    Thread = Agent + Branch + Conversation + Status

    Each thread represents an autonomous agent working on a specific task
    on its own git branch.
    """
    id: str
    name: str
    goal: str
    branch: str                    # thread/{name}/{timestamp}
    status: ThreadStatus
    created_at: datetime
    updated_at: datetime
    conversation: List[ThreadMessage] = field(default_factory=list)
    error: Optional[str] = None

    # For review mode
    review_summary: Optional[str] = None  # Summary from mark_for_review

    # Tracking
    client_id: Optional[str] = None  # Which client owns this thread

    @classmethod
    def create(cls, name: str, goal: str, client_id: str = None) -> 'Thread':
        """Factory method to create a new thread."""
        # Sanitize name for branch naming (alphanumeric, hyphens only)
        safe_name = re.sub(r'[^a-zA-Z0-9-]', '-', name.lower())
        safe_name = re.sub(r'-+', '-', safe_name)  # Collapse multiple dashes
        safe_name = re.sub(r'^-+|-+$', '', safe_name)  # Remove leading/trailing dashes

        # Additional git safety validations
        if not safe_name or safe_name.startswith('/') or safe_name.endswith('.lock'):
            safe_name = "task"

        # Ensure reasonable length (git has limits)
        if len(safe_name) > 50:
            safe_name = safe_name[:50].rstrip('-')

        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

        return cls(
            id=str(uuid.uuid4()),
            name=name,
            goal=goal,
            branch=f"thread/{safe_name}/{timestamp}",
            status=ThreadStatus.WORKING,
            created_at=datetime.now(),
            updated_at=datetime.now(),
            conversation=[],
            client_id=client_id
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert thread to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "name": self.name,
            "goal": self.goal,
            "branch": self.branch,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "message_count": len(self.conversation),
            "error": self.error,
            "review_summary": self.review_summary
        }

    def add_message(self, role: str, content: str, **kwargs) -> ThreadMessage:
        """Add a message to the conversation."""
        message = ThreadMessage.create(role, content, **kwargs)
        self.conversation.append(message)
        self.updated_at = datetime.now()
        return message

    def set_status(self, status: ThreadStatus, summary: str = None):
        """Update thread status."""
        self.status = status
        self.updated_at = datetime.now()
        if status == ThreadStatus.REVIEW and summary:
            self.review_summary = summary

    def set_error(self, error: str):
        """Set error message."""
        self.error = error
        self.updated_at = datetime.now()


class AcceptResult(Enum):
    """Result of accepting thread changes."""
    SUCCESS = "success"           # Merged successfully
    CONFLICT = "conflict"         # Merge conflict, agent will resolve
    ERROR = "error"               # Unexpected error
