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
from . import mentions
from . import approval
from . import commands
from .mentions import parse_mentions, is_ai_addressed, ParsedMentions
from .approval import detect_approval, is_approval, detect_consensus, ApprovalType
from .commands import parse_command, CommandType, ParsedCommand

__all__ = [
    # Classes
    'Thread',
    'ThreadType',
    'ThreadStatus',
    'ThreadMessage',
    'AssistantThread',
    'WorkerThread',
    'ThreadManager',
    'ParsedMentions',
    'ParsedCommand',
    'ApprovalType',
    # Mixins
    'ReadToolsMixin',
    'SpawnMixin',
    'BranchMixin',
    'EditToolsMixin',
    'ReviewMixin',
    # Functions
    'initialize_thread_manager',
    'websocket_endpoint',
    'parse_mentions',
    'is_ai_addressed',
    'parse_command',
    'detect_approval',
    'is_approval',
    'detect_consensus',
    # Enums
    'CommandType',
    'AcceptResult',
    # Modules
    'git_operations',
    'mentions',
    'approval',
    'commands',
]
