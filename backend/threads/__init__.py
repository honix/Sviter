"""
Thread system for wiki agents.

Thread = Conversation + Capabilities (via mixins)

Classes:
- Thread: Base class for all threads
- AssistantThread: Read-only assistant (main branch)
- WorkerThread: Autonomous worker (own branch)

Mixins:
- ReadToolsMixin: Read wiki tools
- SpawnMixin: Spawn worker threads
- BranchMixin: Git branch/worktree
- EditToolsMixin: Edit wiki tools
- ReviewMixin: Review workflow
"""

from .base import Thread, ThreadType, ThreadStatus, ThreadMessage
from .assistant import AssistantThread
from .worker import WorkerThread
from .mixins import (
    ReadToolsMixin,
    SpawnMixin,
    BranchMixin,
    EditToolsMixin,
    ReviewMixin,
)
from .accept_result import AcceptResult
from .manager import ThreadManager, initialize_thread_manager, websocket_endpoint
from . import git_operations

__all__ = [
    # Classes
    'Thread',
    'ThreadType',
    'ThreadStatus',
    'ThreadMessage',
    'AssistantThread',
    'WorkerThread',
    'ThreadManager',
    # Mixins
    'ReadToolsMixin',
    'SpawnMixin',
    'BranchMixin',
    'EditToolsMixin',
    'ReviewMixin',
    # Functions
    'initialize_thread_manager',
    'websocket_endpoint',
    # Other
    'AcceptResult',
    'git_operations',
]
