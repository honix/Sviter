"""
Thread system for wiki agents.

Thread = Agent + Branch + Conversation + Status
"""

from .thread import Thread, ThreadStatus, ThreadMessage
from .accept_result import AcceptResult
from . import git_operations

__all__ = [
    'Thread',
    'ThreadStatus',
    'ThreadMessage',
    'AcceptResult',
    'git_operations',
]
