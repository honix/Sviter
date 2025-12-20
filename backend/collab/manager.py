"""
Collaboration Manager - handles Yjs document synchronization via WebSocket.

Uses pycrdt and pycrdt-websocket for proper Yjs sync protocol handling.
Auto-save is handled by the frontend via REST API (simpler than converting
XmlFragment to markdown on the server).

Tracks active rooms and clients for merge blocking functionality.
"""

import asyncio
import logging
from typing import Optional, Dict, Set, Callable, Awaitable, List
from fastapi import WebSocket, WebSocketDisconnect

from pycrdt.websocket import WebsocketServer

logger = logging.getLogger(__name__)

# Type for room change callback
RoomChangeCallback = Callable[[str, str, str], Awaitable[None]]  # (room_name, client_id, action)


class FastAPIWebSocketAdapter:
    """Adapter to make FastAPI WebSocket compatible with pycrdt-websocket Channel protocol."""

    def __init__(self, websocket: WebSocket, path: str):
        self._websocket = websocket
        self._path = path
        self._closed = False

    @property
    def path(self) -> str:
        return self._path

    def __aiter__(self):
        return self

    async def __anext__(self) -> bytes:
        try:
            return await self.recv()
        except WebSocketDisconnect:
            raise StopAsyncIteration

    async def recv(self) -> bytes:
        if self._closed:
            raise WebSocketDisconnect
        try:
            return await self._websocket.receive_bytes()
        except Exception as e:
            self._closed = True
            raise

    async def send(self, message: bytes) -> None:
        if not self._closed:
            try:
                await self._websocket.send_bytes(message)
            except Exception:
                self._closed = True


class CollaborationManager:
    """
    Manages collaborative editing sessions using pycrdt-websocket.

    Features:
    - Proper Yjs sync protocol handling via pycrdt
    - Server-side document state for new client initialization
    - Automatic broadcast to all clients in a room
    - Tracks active rooms and clients for merge blocking

    Note: Auto-save is handled by the frontend via REST API.
    """

    def __init__(self, wiki=None):
        self.wiki = wiki
        self.server: Optional[WebsocketServer] = None
        self._running = False
        self._server_task: Optional[asyncio.Task] = None
        # Track active rooms: room_name -> set of client_ids (all connections for sync)
        self._active_rooms: Dict[str, Set[str]] = {}
        # Track active EDITORS only: room_name -> set of client_ids (for merge blocking)
        self._active_editors: Dict[str, Set[str]] = {}
        # Callbacks for room changes
        self._room_change_callbacks: List[RoomChangeCallback] = []

    async def start(self):
        """Start the collaboration manager."""
        if self._running:
            return
        self._running = True

        # Create and start the pycrdt-websocket server
        self.server = WebsocketServer(
            rooms_ready=True,
            auto_clean_rooms=True,
            log=logger
        )

        # Start server in background
        self._server_task = asyncio.create_task(self.server.start())
        await self.server.started.wait()

        logger.info("Collaboration manager started (pycrdt)")

    async def stop(self):
        """Stop the collaboration manager."""
        self._running = False

        if self.server:
            await self.server.stop()
        if self._server_task:
            self._server_task.cancel()
            try:
                await self._server_task
            except asyncio.CancelledError:
                pass
        logger.info("Collaboration manager stopped")

    def on_room_change(self, callback: RoomChangeCallback):
        """Register a callback for room changes (join/leave)."""
        self._room_change_callbacks.append(callback)

    async def _notify_room_change(self, room_name: str, client_id: str, action: str):
        """Notify all registered callbacks about a room change."""
        for callback in self._room_change_callbacks:
            try:
                await callback(room_name, client_id, action)
            except Exception as e:
                logger.error(f"Error in room change callback: {e}")

    async def _client_joined(self, room_name: str, client_id: str):
        """Track client joining a room."""
        if room_name not in self._active_rooms:
            self._active_rooms[room_name] = set()
        self._active_rooms[room_name].add(client_id)
        logger.info(f"Room {room_name}: {len(self._active_rooms[room_name])} active editors")
        await self._notify_room_change(room_name, client_id, "join")

    async def _client_left(self, room_name: str, client_id: str):
        """Track client leaving a room."""
        if room_name in self._active_rooms:
            self._active_rooms[room_name].discard(client_id)
            if not self._active_rooms[room_name]:
                del self._active_rooms[room_name]
                logger.info(f"Room {room_name}: no active clients, room closed")
            else:
                logger.info(f"Room {room_name}: {len(self._active_rooms[room_name])} active clients")
        # NOTE: Do NOT clear _active_editors here - the editing state persists
        # until explicitly cleared via set_editing_state(editing=false).
        # This prevents race conditions when users switch views.
        await self._notify_room_change(room_name, client_id, "leave")

    def get_active_rooms(self) -> Dict[str, int]:
        """Get all active rooms with their client counts."""
        return {room: len(clients) for room, clients in self._active_rooms.items()}

    def get_room_clients(self, room_name: str) -> Set[str]:
        """Get client IDs in a specific room."""
        return self._active_rooms.get(room_name, set()).copy()

    def is_page_being_edited(self, page_path: str) -> bool:
        """Check if a page is currently being edited."""
        return page_path in self._active_rooms and len(self._active_rooms[page_path]) > 0

    def get_editors_for_pages(self, page_paths: List[str]) -> Dict[str, Set[str]]:
        """Get editors for multiple pages. Returns only pages with active EDITORS (not viewers)."""
        result = {}
        for path in page_paths:
            if path in self._active_editors and self._active_editors[path]:
                result[path] = self._active_editors[path].copy()
        return result

    async def set_editing_state(self, room_name: str, client_id: str, editing: bool):
        """
        Update a client's editing state.
        Called when user switches between View and Edit modes.
        Only editors (not viewers) are counted for merge blocking.
        """
        if editing:
            # Add to editors
            if room_name not in self._active_editors:
                self._active_editors[room_name] = set()
            if client_id not in self._active_editors[room_name]:
                self._active_editors[room_name].add(client_id)
                logger.info(f"Room {room_name}: {client_id} started editing ({len(self._active_editors[room_name])} editors)")
                await self._notify_room_change(room_name, client_id, "edit_start")
        else:
            # Remove from editors
            if room_name in self._active_editors:
                if client_id in self._active_editors[room_name]:
                    self._active_editors[room_name].discard(client_id)
                    logger.info(f"Room {room_name}: {client_id} stopped editing ({len(self._active_editors.get(room_name, set()))} editors)")
                    if not self._active_editors[room_name]:
                        del self._active_editors[room_name]
                    await self._notify_room_change(room_name, client_id, "edit_stop")

    def get_active_editors(self) -> Dict[str, int]:
        """Get all rooms with their editor counts (for merge blocking)."""
        return {room: len(editors) for room, editors in self._active_editors.items()}

    async def invalidate_room(self, room_name: str):
        """
        Invalidate a room's document state, forcing clients to reload from git.

        Called when git content changes outside of collaborative editing
        (e.g., when a thread is accepted/merged).
        """
        if not self.server:
            return

        try:
            # Delete the room from the server's room cache
            # This forces a fresh document to be created when clients reconnect
            if hasattr(self.server, 'rooms') and room_name in self.server.rooms:
                del self.server.rooms[room_name]
                logger.info(f"Invalidated room {room_name} - clients will reload from git")
        except Exception as e:
            logger.warning(f"Failed to invalidate room {room_name}: {e}")

    async def invalidate_rooms(self, room_names: List[str]):
        """Invalidate multiple rooms."""
        for room_name in room_names:
            await self.invalidate_room(room_name)

    async def connect(self, websocket: WebSocket, client_id: str, room_name: str):
        """
        Handle a new WebSocket connection to a collaborative room.

        Args:
            websocket: The FastAPI WebSocket connection
            client_id: Unique client identifier
            room_name: The page path (room name)
        """
        if not self.server:
            await websocket.close(code=1011, reason="Server not initialized")
            return

        # Accept the websocket connection with the requested subprotocol if any
        subprotocols = websocket.scope.get("subprotocols", [])
        subprotocol = subprotocols[0] if subprotocols else None
        await websocket.accept(subprotocol=subprotocol)

        logger.info(f"Client {client_id} connecting to room {room_name}")

        # Track client joining
        await self._client_joined(room_name, client_id)

        # Create adapter for pycrdt-websocket
        adapter = FastAPIWebSocketAdapter(websocket, f"/{room_name}")

        try:
            # Serve the websocket using pycrdt-websocket
            await self.server.serve(adapter)
            logger.info(f"Client {client_id} finished in room {room_name}")
        except WebSocketDisconnect:
            logger.info(f"Client {client_id} disconnected from room {room_name}")
        except Exception as e:
            logger.error(f"Error in collab connection for {client_id}: {e}")
        finally:
            # Track client leaving
            await self._client_left(room_name, client_id)


# Global instance
collab_manager: Optional[CollaborationManager] = None


def initialize_collab_manager(wiki=None) -> CollaborationManager:
    """Initialize the global collaboration manager."""
    global collab_manager
    collab_manager = CollaborationManager(wiki=wiki)
    return collab_manager
