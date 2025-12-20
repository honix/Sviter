"""
Collaborative editing module using Yjs for real-time synchronization.

This module provides:
- CollaborationManager: Manages Yjs documents and WebSocket connections
- Persistence: Debounced saving of collaborative documents to git
"""

from .manager import CollaborationManager, collab_manager, initialize_collab_manager
from .persistence import CollabPersistence

__all__ = [
    'CollaborationManager',
    'collab_manager',
    'initialize_collab_manager',
    'CollabPersistence',
]
