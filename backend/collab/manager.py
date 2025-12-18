"""
Collaboration Manager - handles Yjs document synchronization via WebSocket.

Uses pycrdt and pycrdt-websocket for proper Yjs sync protocol handling.
Auto-save is handled by the frontend via REST API (simpler than converting
XmlFragment to markdown on the server).
"""

import asyncio
import logging
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect

from pycrdt.websocket import WebsocketServer

logger = logging.getLogger(__name__)


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

    Note: Auto-save is handled by the frontend via REST API.
    """

    def __init__(self, wiki=None):
        self.wiki = wiki
        self.server: Optional[WebsocketServer] = None
        self._running = False
        self._server_task: Optional[asyncio.Task] = None

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


# Global instance
collab_manager: Optional[CollaborationManager] = None


def initialize_collab_manager(wiki=None) -> CollaborationManager:
    """Initialize the global collaboration manager."""
    global collab_manager
    collab_manager = CollaborationManager(wiki=wiki)
    return collab_manager
