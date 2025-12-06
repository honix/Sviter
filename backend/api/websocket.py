"""
WebSocket API for thread-based wiki agents.

Handles:
- Scout chat (main chat, read-only)
- Thread chats (worker agents on branches)
- Thread lifecycle (create, status changes, accept/reject)
"""

from fastapi import WebSocket, WebSocketDisconnect
from agents.unified_executor import UnifiedAgentExecutor
from storage import GitWiki
from threads import ThreadManager, ScoutAgent, get_scout_tools, AcceptResult
import json
from typing import Dict, Any, Optional
import asyncio
import os


class WebSocketManager:
    """Manages WebSocket connections and thread-based agent sessions."""

    def __init__(self, wiki: GitWiki, api_key: str = None):
        self.wiki = wiki
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")

        # Connection tracking
        self.active_connections: Dict[str, WebSocket] = {}

        # Scout executor per client (for main chat)
        self.scout_executors: Dict[str, UnifiedAgentExecutor] = {}

        # Thread manager (shared across all clients)
        self.thread_manager = ThreadManager(wiki, self.api_key)

        # Current view per client: "scout" or thread_id
        self.client_view: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        """Accept WebSocket connection and initialize scout session."""
        print(f"🔌 WebSocketManager.connect() called for client: {client_id}")
        await websocket.accept()
        print(f"✅ WebSocket accepted for client: {client_id}")

        self.active_connections[client_id] = websocket
        self.client_view[client_id] = "scout"
        print(f"📝 Added {client_id} to active_connections. Total: {len(self.active_connections)}")

        # Initialize scout session
        await self._start_scout_session(client_id)

    async def _start_scout_session(self, client_id: str):
        """Initialize scout agent session for client."""
        # Create scout executor
        executor = UnifiedAgentExecutor(wiki=self.wiki, api_key=self.api_key)
        self.scout_executors[client_id] = executor

        # Define callbacks
        async def on_message_callback(msg_type: str, content: str):
            if msg_type == "system_prompt":
                await self.send_message(client_id, {
                    "type": "system_prompt",
                    "content": content
                })
            elif msg_type == "assistant":
                await self.send_message(client_id, {
                    "type": "chat_response",
                    "message": content
                })

        async def on_tool_call_callback(tool_info: Dict[str, Any]):
            await self.send_message(client_id, {
                "type": "tool_call",
                "tool_name": tool_info["tool_name"],
                "arguments": tool_info["arguments"],
                "result": tool_info["result"],
                "iteration": tool_info["iteration"]
            })

            # Check if spawn_thread was called
            if tool_info["tool_name"] == "spawn_thread":
                # Thread was created - notify frontend
                # (The thread is auto-started in the spawn callback)
                pass

        # Start scout session
        session_result = await executor.start_session(
            agent_class=ScoutAgent,
            on_message=on_message_callback,
            on_tool_call=on_tool_call_callback,
        )

        if session_result["success"]:
            print(f"✅ Scout session started for {client_id}")

            # Send thread list on connect
            threads = self.thread_manager.list_threads(client_id)
            if threads:
                await self.send_message(client_id, {
                    "type": "thread_list",
                    "threads": [t.to_dict() for t in threads]
                })
        else:
            print(f"❌ Failed to start scout session: {session_result.get('error')}")
            await self.send_message(client_id, {
                "type": "error",
                "message": f"Failed to start session: {session_result.get('error')}"
            })

    def disconnect(self, client_id: str):
        """Clean up connection and resources."""
        print(f"🔌❌ WebSocketManager.disconnect() called for client: {client_id}")

        # End scout session
        if client_id in self.scout_executors:
            try:
                self.scout_executors[client_id].end_session(call_on_finish=False)
            except Exception as e:
                print(f"⚠️ Error ending scout session: {e}")
            del self.scout_executors[client_id]

        # Cleanup threads (but keep review threads)
        self.thread_manager.cleanup_client(client_id)

        # Remove connection
        if client_id in self.client_view:
            del self.client_view[client_id]

        if client_id in self.active_connections:
            del self.active_connections[client_id]
            print(f"🗑️ Removed {client_id}. Remaining: {len(self.active_connections)}")

    async def send_message(self, client_id: str, message: Dict[str, Any]):
        """Send message to specific client."""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_text(json.dumps(message))
                print(f"✅ Message sent to {client_id}: {message.get('type', 'unknown')}")
            except Exception as e:
                error_msg = str(e)
                print(f"❌ Error sending message to {client_id}: {error_msg}")
                if "no close frame" not in error_msg.lower() and "connection closed" in error_msg.lower():
                    self.disconnect(client_id)

    async def handle_message(self, client_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming message from client."""
        print(f"📨 WebSocket received message from {client_id}: {message_data}")

        message_type = message_data.get("type")

        if message_type == "chat":
            # Route to current view (scout or thread)
            current_view = self.client_view.get(client_id, "scout")

            if current_view == "scout":
                return await self._handle_scout_chat(client_id, message_data)
            else:
                # Viewing a thread - send message to thread
                return await self._handle_thread_chat(client_id, current_view, message_data)

        elif message_type == "select_thread":
            # Switch view to thread or scout
            thread_id = message_data.get("thread_id")
            return await self._handle_select_thread(client_id, thread_id)

        elif message_type == "accept_thread":
            thread_id = message_data.get("thread_id")
            return await self._handle_accept_thread(client_id, thread_id)

        elif message_type == "reject_thread":
            thread_id = message_data.get("thread_id")
            return await self._handle_reject_thread(client_id, thread_id)

        elif message_type == "get_thread_list":
            threads = self.thread_manager.list_threads(client_id)
            await self.send_message(client_id, {
                "type": "thread_list",
                "threads": [t.to_dict() for t in threads]
            })
            return {"type": "success"}

        elif message_type == "get_thread_diff":
            thread_id = message_data.get("thread_id")
            return await self._handle_get_thread_diff(client_id, thread_id)

        elif message_type == "reset":
            # Reset scout conversation
            if client_id in self.scout_executors:
                self.scout_executors[client_id].reset_conversation()

            # Switch to scout view
            self.client_view[client_id] = "scout"

            # Restart scout session
            await self._start_scout_session(client_id)
            return {"type": "success", "message": "Conversation reset"}

        else:
            return {"type": "error", "message": f"Unknown message type: {message_type}"}

    async def _handle_scout_chat(self, client_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle chat message in scout mode."""
        user_message = message_data.get("message", "")
        if not user_message:
            return {"type": "error", "message": "Empty message"}

        executor = self.scout_executors.get(client_id)
        if not executor:
            return {"type": "error", "message": "Scout session not found"}

        # Setup spawn_thread callback to create and start threads
        def spawn_thread_callback(name: str, goal: str) -> Dict[str, Any]:
            thread = self.thread_manager.create_thread(name, goal, client_id)

            # Start thread in background
            asyncio.create_task(self._start_thread_with_notifications(client_id, thread.id))

            return thread.to_dict()

        def list_threads_callback():
            threads = self.thread_manager.list_threads(client_id)
            return [t.to_dict() for t in threads]

        # Get scout tools with callbacks
        scout_tools = get_scout_tools(
            self.wiki,
            spawn_thread_callback,
            list_threads_callback
        )

        # Process the message with custom scout tools
        result = await executor.process_turn(user_message, custom_tools=scout_tools)

        if result.status in ['completed', 'stopped']:
            return {"type": "success"}
        elif result.status == 'error':
            return {"type": "error", "message": result.error}
        else:
            return {"type": "error", "message": f"Unexpected status: {result.status}"}

    async def _start_thread_with_notifications(self, client_id: str, thread_id: str):
        """Start thread and send WebSocket notifications."""
        thread = self.thread_manager.get_thread(thread_id)
        if not thread:
            return

        # Notify thread created
        await self.send_message(client_id, {
            "type": "thread_created",
            "thread": thread.to_dict()
        })

        # Define callbacks for thread execution
        async def on_message(msg_type: str, content: str):
            await self.send_message(client_id, {
                "type": "thread_message",
                "thread_id": thread_id,
                "role": msg_type,
                "content": content
            })

        async def on_tool_call(tool_info: Dict[str, Any]):
            await self.send_message(client_id, {
                "type": "thread_message",
                "thread_id": thread_id,
                "role": "tool_call",
                "content": tool_info.get("result", ""),
                "tool_name": tool_info.get("tool_name"),
                "tool_args": tool_info.get("arguments")
            })

            # Notify page updates
            if tool_info.get("tool_name") == "edit_page":
                await self.send_message(client_id, {
                    "type": "page_updated",
                    "title": tool_info["arguments"].get("title")
                    # NOTE: Do NOT include "content" field here - it would contain the tool result
                    # (e.g., "Page updated successfully...") which could be confused with page content
                })

        async def on_status_change(tid: str, status: str, message: str):
            await self.send_message(client_id, {
                "type": "thread_status",
                "thread_id": tid,
                "status": status,
                "message": message
            })

            # Also send updated thread list
            threads = self.thread_manager.list_threads(client_id)
            await self.send_message(client_id, {
                "type": "thread_list",
                "threads": [t.to_dict() for t in threads]
            })

        # Start thread with guaranteed cleanup on failure
        try:
            success = await self.thread_manager.start_thread(
                thread_id,
                on_message=on_message,
                on_tool_call=on_tool_call,
                on_status_change=on_status_change
            )
            if not success:
                # Thread failed to start - cleanup
                self.thread_manager._cleanup_thread(thread_id)
                await self.send_message(client_id, {
                    "type": "thread_deleted",
                    "thread_id": thread_id,
                    "reason": "start_failed"
                })
        except Exception as e:
            # Ensure cleanup on any exception
            print(f"❌ Thread {thread_id} start failed: {e}")
            self.thread_manager._cleanup_thread(thread_id)
            await self.send_message(client_id, {
                "type": "thread_deleted",
                "thread_id": thread_id,
                "reason": f"error: {e}"
            })

    async def _handle_thread_chat(self, client_id: str, thread_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle chat message to a thread."""
        user_message = message_data.get("message", "")
        if not user_message:
            return {"type": "error", "message": "Empty message"}

        thread = self.thread_manager.get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        # Send message to thread
        success = await self.thread_manager.send_to_thread(thread_id, user_message)

        if success:
            return {"type": "success"}
        else:
            return {"type": "error", "message": "Failed to send message to thread"}

    async def _handle_select_thread(self, client_id: str, thread_id: Optional[str]) -> Dict[str, Any]:
        """Handle switching to thread view or back to scout."""
        if thread_id is None:
            # Switch to scout
            self.client_view[client_id] = "scout"

            # Send scout conversation history
            executor = self.scout_executors.get(client_id)
            if executor:
                history = executor.get_conversation_history()
                await self.send_message(client_id, {
                    "type": "thread_selected",
                    "thread_id": None,
                    "history": history
                })

            return {"type": "success"}

        # Switch to thread
        thread = self.thread_manager.get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        self.client_view[client_id] = thread_id

        # Send thread conversation history
        await self.send_message(client_id, {
            "type": "thread_selected",
            "thread_id": thread_id,
            "thread": thread.to_dict(),
            "history": [m.to_dict() for m in thread.conversation]
        })

        return {"type": "success"}

    async def _handle_accept_thread(self, client_id: str, thread_id: str) -> Dict[str, Any]:
        """Handle accepting thread changes (merge to main)."""
        thread = self.thread_manager.get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        result = await self.thread_manager.accept_thread(thread_id)

        if result == AcceptResult.SUCCESS:
            # Thread merged and deleted
            await self.send_message(client_id, {
                "type": "thread_deleted",
                "thread_id": thread_id,
                "reason": "accepted"
            })

            # Switch back to scout
            self.client_view[client_id] = "scout"

            # Send updated thread list
            threads = self.thread_manager.list_threads(client_id)
            await self.send_message(client_id, {
                "type": "thread_list",
                "threads": [t.to_dict() for t in threads]
            })

            # Notify pages changed
            await self.send_message(client_id, {
                "type": "pages_changed"
            })

            return {"type": "success", "result": "accepted"}

        elif result == AcceptResult.CONFLICT:
            # Conflict - agent is resolving
            await self.send_message(client_id, {
                "type": "accept_conflict",
                "thread_id": thread_id,
                "message": "Merge conflict detected. Agent is resolving..."
            })

            return {"type": "success", "result": "conflict"}

        else:
            return {"type": "error", "message": "Failed to accept thread"}

    async def _handle_reject_thread(self, client_id: str, thread_id: str) -> Dict[str, Any]:
        """Handle rejecting thread changes (delete branch)."""
        success = await self.thread_manager.reject_thread(thread_id)

        if success:
            await self.send_message(client_id, {
                "type": "thread_deleted",
                "thread_id": thread_id,
                "reason": "rejected"
            })

            # Switch back to scout
            self.client_view[client_id] = "scout"

            # Send updated thread list
            threads = self.thread_manager.list_threads(client_id)
            await self.send_message(client_id, {
                "type": "thread_list",
                "threads": [t.to_dict() for t in threads]
            })

            return {"type": "success"}
        else:
            return {"type": "error", "message": "Failed to reject thread"}

    async def _handle_get_thread_diff(self, client_id: str, thread_id: str) -> Dict[str, Any]:
        """Get diff statistics for a thread."""
        diff_stats = self.thread_manager.get_thread_diff_stats(thread_id)

        if diff_stats:
            await self.send_message(client_id, {
                "type": "thread_diff",
                "thread_id": thread_id,
                "diff_stats": diff_stats
            })
            return {"type": "success"}
        else:
            return {"type": "error", "message": "Failed to get diff stats"}


# Global WebSocket manager instance
websocket_manager: Optional[WebSocketManager] = None


def initialize_websocket_manager(wiki: GitWiki, api_key: str = None):
    """Initialize the global WebSocket manager with wiki instance."""
    global websocket_manager
    websocket_manager = WebSocketManager(wiki, api_key)
    print(f"✅ WebSocket manager initialized")


async def websocket_endpoint(websocket: WebSocket, client_id: str = "default"):
    """WebSocket endpoint handler."""
    if websocket_manager is None:
        print("❌ WebSocket manager not initialized!")
        await websocket.close(code=1011, reason="Server not ready")
        return

    await websocket_manager.connect(websocket, client_id)

    try:
        while True:
            print(f"🔄 Waiting for message from {client_id}...")
            data = await websocket.receive_text()
            print(f"📨 Raw message received from {client_id}: {data}")

            try:
                message_data = json.loads(data)
            except json.JSONDecodeError as e:
                print(f"❌ JSON decode error: {e}")
                await websocket_manager.send_message(client_id, {
                    "type": "error",
                    "message": "Invalid JSON format"
                })
                continue

            # Handle the message
            response = await websocket_manager.handle_message(client_id, message_data)

            # Send response if needed
            if response.get("type") in ["error", "success"]:
                await websocket_manager.send_message(client_id, response)

    except WebSocketDisconnect:
        print(f"🔌💔 WebSocketDisconnect for {client_id}")
        websocket_manager.disconnect(client_id)
    except Exception as e:
        print(f"🔌⚠️ WebSocket error for client {client_id}: {e}")
        websocket_manager.disconnect(client_id)
