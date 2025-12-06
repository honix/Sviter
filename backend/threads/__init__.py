"""
Thread system for wiki agents.

Threads abstract git branches and provide a simple model for:
- Scout chat: Read-only main chat that spawns threads
- Thread chat: Autonomous agent working on a branch
"""

from .models import Thread, ThreadStatus, ThreadMessage, AcceptResult
from .manager import ThreadManager
from .scout_agent import ScoutAgent, get_scout_tools
from .thread_agent import ThreadAgent, get_thread_tools

__all__ = [
    'Thread',
    'ThreadStatus',
    'ThreadMessage',
    'AcceptResult',
    'ThreadManager',
    'ScoutAgent',
    'get_scout_tools',
    'ThreadAgent',
    'get_thread_tools',
]
