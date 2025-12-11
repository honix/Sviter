"""
ThreadManager - Unified manager for all thread operations.

Handles:
- WebSocket connections
- Thread lifecycle (create, execute, accept/reject)
- Message routing and broadcasting
- SQLite persistence via Thread classes

Replaces the old SessionManager with a thread-centric design.
"""

from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Any, Optional, List
import json
import asyncio
import os

from storage import GitWiki
from agents.executor import AgentExecutor
from threads.base import Thread, ThreadStatus
from threads.assistant import AssistantThread
from threads.worker import WorkerThread
from threads.accept_result import AcceptResult
from db import (
    get_or_create_guest,
    get_thread as db_get_thread,
    list_threads_for_user,
    list_worker_threads,
    can_access_thread,
)


class ThreadManager:
    """
    Unified manager for all thread operations.

    Manages WebSocket connections, thread execution, and message routing.
    All thread state is persisted to SQLite via Thread classes.
    """

    def __init__(self, wiki: GitWiki, api_key: str = None):
        self.wiki = wiki  # Main wiki (on main branch)
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")

        # WebSocket connections: client_id -> WebSocket
        self.connections: Dict[str, WebSocket] = {}

        # Active executors: thread_id -> AgentExecutor
        self.executors: Dict[str, AgentExecutor] = {}

        # Background tasks: thread_id -> asyncio.Task
        self.tasks: Dict[str, asyncio.Task] = {}

        # Current view per client: client_id -> thread_id (which thread they're viewing)
        self.client_view: Dict[str, str] = {}

        # In-memory thread cache: thread_id -> Thread instance
        # Threads are loaded from DB on demand and cached here
        self._thread_cache: Dict[str, Thread] = {}

    # ─────────────────────────────────────────────────────────────────────────
    # Thread Cache Management
    # ─────────────────────────────────────────────────────────────────────────

    def _get_thread(self, thread_id: str) -> Optional[Thread]:
        """Get thread from cache or load from database."""
        if thread_id in self._thread_cache:
            return self._thread_cache[thread_id]

        # Load from database
        data = db_get_thread(thread_id)
        if not data:
            return None

        # Create appropriate thread type
        if data['type'] == 'assistant':
            thread = AssistantThread.from_dict(data)
        else:
            thread = WorkerThread.from_dict(data)

        self._thread_cache[thread_id] = thread
        return thread

    def _cache_thread(self, thread: Thread) -> None:
        """Add thread to cache."""
        self._thread_cache[thread.id] = thread

    def _remove_from_cache(self, thread_id: str) -> None:
        """Remove thread from cache."""
        self._thread_cache.pop(thread_id, None)

    def _get_wiki_for_thread(self, thread: Thread) -> 'GitWiki':
        """Get the appropriate wiki instance for a thread."""
        if hasattr(thread, 'worktree_path') and thread.worktree_path:
            wiki = thread.get_wiki()
            if wiki:
                return wiki
        return self.wiki

    def _prepare_thread_callbacks(self, thread: Thread, client_id: str) -> Dict[str, Any]:
        """
        Prepare callbacks for a thread with manager context.

        Different thread types need different callbacks, but manager provides
        the underlying functionality (creating threads, broadcasting, etc.)
        """
        # Broadcast function for status updates
        async def broadcast_fn(message: Dict[str, Any]):
            await self.broadcast(message)

        # Send thread list to all connected clients
        async def send_thread_list_fn():
            for cid in self.connections:
                await self._send_thread_list(cid)

        # Spawn callback (for assistant threads)
        def spawn_callback(name: str, goal: str) -> Dict[str, Any]:
            worker = self._create_worker_thread(name, goal, client_id)
            asyncio.create_task(self._start_worker_with_notifications(worker, client_id))
            return worker.to_dict()

        # List callback (for assistant threads)
        def list_callback():
            return [t for t in list_worker_threads()]

        # Thread prepares its specific callbacks using these primitives
        return thread.prepare_callbacks(
            broadcast_fn=broadcast_fn,
            send_thread_list_fn=send_thread_list_fn,
            spawn_callback=spawn_callback,
            list_callback=list_callback
        )

    # ─────────────────────────────────────────────────────────────────────────
    # WebSocket Connection Management
    # ─────────────────────────────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, client_id: str):
        """Accept WebSocket connection and initialize user's assistant thread."""
        await websocket.accept()

        # Validate user (creates guest if not exists)
        user = get_or_create_guest(client_id)
        print(f"👤 User connected: {user['id']} (type: {user['type']})")

        self.connections[client_id] = websocket

        # Get or create assistant thread for this user
        # Check cache first to preserve executor's thread reference
        db_assistant = AssistantThread.get_or_create_for_user(client_id)

        # Use cached thread if exists (executor has reference to it)
        # Otherwise cache the new one
        if db_assistant.id in self._thread_cache:
            assistant = self._thread_cache[db_assistant.id]
        else:
            assistant = db_assistant
            self._cache_thread(assistant)

        # Set initial view to assistant thread
        self.client_view[client_id] = assistant.id

        # Start executor for assistant if not exists
        if assistant.id not in self.executors:
            await self._start_executor(assistant, client_id)

        # Force reload messages from DB to ensure we have latest
        assistant.reload_messages()

        # Send initial state to client
        await self.send_message(client_id, {
            "type": "thread_selected",
            "thread_id": assistant.id,
            "thread_type": "assistant",
            "history": [m.to_dict() for m in assistant.messages]
        })

        # Send thread list
        await self._send_thread_list(client_id)

    async def disconnect(self, client_id: str):
        """Clean up connection but keep threads (they persist in DB)."""
        # Clear client view
        self.client_view.pop(client_id, None)

        # Remove WebSocket connection
        self.connections.pop(client_id, None)

        print(f"👋 User disconnected: {client_id}")

    async def send_message(self, client_id: str, message: Dict[str, Any]):
        """Send message to specific client."""
        if client_id in self.connections:
            try:
                await self.connections[client_id].send_text(json.dumps(message))
            except Exception as e:
                if "connection closed" in str(e).lower():
                    await self.disconnect(client_id)

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast message to ALL connected clients."""
        disconnected = []
        for client_id, websocket in self.connections.items():
            try:
                await websocket.send_text(json.dumps(message))
            except Exception:
                disconnected.append(client_id)

        for client_id in disconnected:
            await self.disconnect(client_id)

    async def broadcast_to_thread_viewers(self, thread_id: str, message: Dict[str, Any]):
        """Broadcast message to clients viewing a specific thread."""
        for client_id, viewing_thread_id in self.client_view.items():
            if viewing_thread_id == thread_id:
                await self.send_message(client_id, message)

    async def _send_thread_list(self, client_id: str):
        """Send thread list to client."""
        # Get user's threads (owned + shared)
        user_threads = list_threads_for_user(client_id)

        # Also get all worker threads (visible to everyone)
        worker_threads = list_worker_threads()

        # Merge and dedupe
        thread_ids = set()
        threads = []
        for t in user_threads + worker_threads:
            if t['id'] not in thread_ids:
                thread_ids.add(t['id'])
                threads.append(t)

        await self.send_message(client_id, {
            "type": "thread_list",
            "threads": threads
        })

    # ─────────────────────────────────────────────────────────────────────────
    # Executor Management
    # ─────────────────────────────────────────────────────────────────────────

    async def _start_executor(self, thread: Thread, client_id: str) -> bool:
        """Start an executor for a thread."""
        # Get appropriate wiki for this thread
        wiki = self._get_wiki_for_thread(thread)

        executor = AgentExecutor(wiki=wiki, api_key=self.api_key)

        # Message callback
        async def on_message(msg_type: str, content: str):
            if msg_type == "system_prompt":
                await self.broadcast_to_thread_viewers(thread.id, {
                    "type": "system_prompt",
                    "thread_id": thread.id,
                    "content": content
                })
            elif msg_type == "assistant":
                thread.add_message("assistant", content)
                await self.broadcast({
                    "type": "thread_message",
                    "thread_id": thread.id,
                    "role": "assistant",
                    "content": content
                })

        # Tool call callback
        async def on_tool_call(tool_info: Dict[str, Any]):
            thread.add_message(
                "tool_call",
                tool_info.get("result", ""),
                tool_name=tool_info.get("tool_name"),
                tool_args=tool_info.get("arguments"),
                tool_result=tool_info.get("result")
            )
            await self.broadcast({
                "type": "thread_message",
                "thread_id": thread.id,
                "role": "tool_call",
                "content": tool_info.get("result", ""),
                "tool_name": tool_info.get("tool_name"),
                "tool_args": tool_info.get("arguments")
            })

            # Notify page updates
            if tool_info.get("tool_name") == "edit_page":
                await self.broadcast({
                    "type": "page_updated",
                    "title": tool_info["arguments"].get("title")
                })

        # Start session
        result = await executor.start_session(
            system_prompt=thread.get_prompt(),
            model="claude-sonnet-4-5",
            provider="claude",
            human_in_loop=True,  # All threads are human-in-loop
            agent_name=thread.name,
            on_message=on_message,
            on_tool_call=on_tool_call,
        )

        if not result["success"]:
            return False

        self.executors[thread.id] = executor
        return True

    async def _cleanup_executor(self, thread_id: str):
        """Clean up an executor."""
        # Cancel background task
        if thread_id in self.tasks:
            self.tasks[thread_id].cancel()
            del self.tasks[thread_id]

        # End executor
        executor = self.executors.pop(thread_id, None)
        if executor:
            try:
                await executor.end_session(call_on_finish=False)
            except Exception:
                pass

    # ─────────────────────────────────────────────────────────────────────────
    # Thread Creation
    # ─────────────────────────────────────────────────────────────────────────

    def _create_worker_thread(self, name: str, goal: str, client_id: str) -> WorkerThread:
        """Create a new worker thread with git branch."""
        thread = WorkerThread.create(owner_id=client_id, name=name, goal=goal)

        # Initialize git branch and worktree
        error = thread.initialize_branch(self.wiki)
        if error:
            thread.set_error(error)

        self._cache_thread(thread)
        return thread

    async def _start_initial_message_thread(self, thread: Thread, client_id: str) -> bool:
        """
        Start initial-message thread execution.

        Works with any thread type that has an initial message (starts_with_initial_message).
        """
        if not thread.starts_with_initial_message():
            return False

        # For worker threads, check worktree exists
        if hasattr(thread, 'worktree_path') and not thread.worktree_path:
            return False

        # Start executor
        success = await self._start_executor(thread, client_id)
        if not success:
            return False

        # Get wiki and tools for this thread
        wiki = self._get_wiki_for_thread(thread)
        callbacks = self._prepare_thread_callbacks(thread, client_id)
        tools = thread.get_tools(wiki, **callbacks)

        # Run thread execution in background
        task = asyncio.create_task(self._run_initial_message_thread(thread, tools))
        self.tasks[thread.id] = task

        return True

    async def _run_initial_message_thread(self, thread: Thread, tools: List):
        """
        Execute initial-message thread until completion or status change.

        Uses thread's get_initial_message() and get_post_turn_action() for behavior.
        """
        executor = self.executors.get(thread.id)
        if not executor:
            return

        try:
            # Get initial message from thread
            initial = thread.get_initial_message()
            if not initial:
                return

            thread.add_message("user", initial)
            await self.broadcast({
                "type": "thread_message",
                "thread_id": thread.id,
                "role": "user",
                "content": initial
            })

            thread.set_generating(True)
            result = await executor.process_turn(initial, custom_tools=tools)
            thread.set_generating(False)

            # Continue until thread decides to stop
            while not thread.is_finished():
                # Let thread decide what to do next
                action = thread.get_post_turn_action(result.status)

                if action and action.get("type") == "prompt":
                    # Thread wants to prompt agent again
                    prompt_message = action.get("message", "")
                    thread.add_message("system", prompt_message)
                    await self.broadcast({
                        "type": "thread_message",
                        "thread_id": thread.id,
                        "role": "system",
                        "content": prompt_message
                    })
                    thread.set_generating(True)
                    result = await executor.process_turn(prompt_message, custom_tools=tools)
                    thread.set_generating(False)
                    continue

                elif result.status == 'error':
                    thread.set_error(result.error)
                    if hasattr(thread, 'request_help_status'):
                        thread.request_help_status()
                    await self.broadcast({
                        "type": "thread_status",
                        "thread_id": thread.id,
                        "status": "need_help",
                        "message": f"Error: {result.error}"
                    })
                    break

                # No more action needed
                break

        except asyncio.CancelledError:
            pass
        except Exception as e:
            thread.set_error(str(e))
            if hasattr(thread, 'request_help_status'):
                thread.request_help_status()

    # ─────────────────────────────────────────────────────────────────────────
    # Message Handling
    # ─────────────────────────────────────────────────────────────────────────

    async def handle_message(self, client_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming WebSocket message."""
        message_type = message_data.get("type")

        if message_type == "chat":
            return await self._handle_chat(client_id, message_data)

        elif message_type == "select_thread":
            return await self._handle_select_thread(client_id, message_data.get("thread_id"))

        elif message_type == "accept_thread":
            return await self._handle_accept_thread(client_id, message_data.get("thread_id"))

        elif message_type == "reject_thread":
            return await self._handle_reject_thread(client_id, message_data.get("thread_id"))

        elif message_type == "get_thread_list":
            await self._send_thread_list(client_id)
            return {"type": "success"}

        elif message_type == "get_thread_diff":
            return await self._handle_get_thread_diff(client_id, message_data.get("thread_id"))

        elif message_type == "reset":
            return await self._handle_reset(client_id)

        return {"type": "error", "message": f"Unknown message type: {message_type}"}

    async def _handle_chat(self, client_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Unified chat handler for all thread types.

        Thread behavior is controlled by thread methods, not isinstance checks.
        """
        user_message = message_data.get("message", "")
        if not user_message:
            return {"type": "error", "message": "Empty message"}

        current_thread_id = self.client_view.get(client_id)
        if not current_thread_id:
            return {"type": "error", "message": "No thread selected"}

        thread = self._get_thread(current_thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        executor = self.executors.get(thread.id)
        if not executor:
            print(f"❌ No executor for thread {thread.id}. Available executors: {list(self.executors.keys())}")
            return {"type": "error", "message": "Thread executor not found"}

        # Resume if waiting for input (thread decides if applicable)
        if hasattr(thread, 'resume_working') and thread.status in (ThreadStatus.NEED_HELP, ThreadStatus.REVIEW):
            thread.resume_working()
            await self.broadcast({
                "type": "thread_status",
                "thread_id": thread.id,
                "status": "working",
                "message": "Resuming work"
            })

        # Check if thread can receive messages
        if thread.is_finished():
            return {"type": "error", "message": f"Thread is finished (status: {thread.status.value})"}

        # Get wiki and callbacks for this thread
        wiki = self._get_wiki_for_thread(thread)
        callbacks = self._prepare_thread_callbacks(thread, client_id)
        tools = thread.get_tools(wiki, **callbacks)

        # Add user message
        thread.add_message("user", user_message, user_id=client_id)

        # Broadcast for initial-message threads (workers), send for chat threads (assistant)
        if thread.starts_with_initial_message():
            await self.broadcast({
                "type": "thread_message",
                "thread_id": thread.id,
                "role": "user",
                "content": user_message,
                "user_id": client_id
            })

        # Signal agent start
        thread.set_generating(True)
        await self.broadcast_to_thread_viewers(thread.id, {
            "type": "agent_start",
            "thread_id": thread.id
        })

        # Process turn
        result = await executor.process_turn(user_message, custom_tools=tools)

        # Post-turn action loop (thread decides if follow-up needed)
        action = thread.get_post_turn_action(result.status)
        while action and action.get("type") == "prompt":
            prompt_message = action.get("message", "")
            thread.add_message("system", prompt_message)
            await self.broadcast({
                "type": "thread_message",
                "thread_id": thread.id,
                "role": "system",
                "content": prompt_message
            })
            result = await executor.process_turn(prompt_message, custom_tools=tools)
            action = thread.get_post_turn_action(result.status)

        thread.set_generating(False)
        await self.broadcast_to_thread_viewers(thread.id, {
            "type": "agent_complete",
            "thread_id": thread.id
        })

        # Handle errors
        if result.status == 'error':
            thread.set_error(result.error)
            if hasattr(thread, 'request_help_status'):
                thread.request_help_status()
            return {"type": "error", "message": result.error}

        return {"type": "success"}

    async def _start_worker_with_notifications(self, thread: WorkerThread, client_id: str):
        """Start worker thread and broadcast notifications."""
        await self.broadcast({
            "type": "thread_created",
            "thread": thread.to_dict()
        })

        try:
            success = await self._start_initial_message_thread(thread, client_id)
            if not success:
                await self._cleanup_thread(thread.id)
                await self.broadcast({
                    "type": "thread_deleted",
                    "thread_id": thread.id,
                    "reason": "start_failed"
                })
        except Exception as e:
            await self._cleanup_thread(thread.id)
            await self.broadcast({
                "type": "thread_deleted",
                "thread_id": thread.id,
                "reason": f"error: {e}"
            })

    async def _handle_select_thread(self, client_id: str, thread_id: Optional[str]) -> Dict[str, Any]:
        """Switch client's view to a different thread."""
        if thread_id is None:
            # Switch to assistant
            assistant = AssistantThread.get_or_create_for_user(client_id)
            thread_id = assistant.id

        thread = self._get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        # Check access (initial-message threads like workers are visible to all)
        if not can_access_thread(thread_id, client_id) and not thread.starts_with_initial_message():
            return {"type": "error", "message": "Access denied"}

        self.client_view[client_id] = thread_id

        # Start executor if needed (for threads loaded from DB)
        if thread.id not in self.executors and not thread.is_finished():
            await self._start_executor(thread, client_id)

        # Force reload messages from DB to ensure we have latest
        thread.reload_messages()

        await self.send_message(client_id, {
            "type": "thread_selected",
            "thread_id": thread_id,
            "thread_type": thread.type.value,
            "thread": thread.to_dict(),
            "history": [m.to_dict() for m in thread.messages]
        })

        # Send agent_start if currently generating
        if thread.is_generating:
            await self.send_message(client_id, {
                "type": "agent_start",
                "thread_id": thread_id
            })

        return {"type": "success"}

    async def _handle_accept_thread(self, client_id: str, thread_id: str) -> Dict[str, Any]:
        """Accept thread changes."""
        thread = self._get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        if not thread.can_accept():
            return {"type": "error", "message": "Thread cannot be accepted"}

        result = thread.accept(self.wiki)

        if result == AcceptResult.SUCCESS:
            await self.broadcast({
                "type": "thread_status",
                "thread_id": thread_id,
                "status": "accepted",
                "message": "Changes merged to main"
            })

            # Clean up executor
            await self._cleanup_executor(thread_id)

            # Refresh thread list and pages
            for cid in self.connections:
                await self._send_thread_list(cid)
            await self.broadcast({"type": "pages_changed"})

            return {"type": "success", "result": "accepted"}

        elif result == AcceptResult.CONFLICT:
            await self.broadcast({
                "type": "accept_conflict",
                "thread_id": thread_id,
                "message": "Merge conflict detected. Agent is resolving..."
            })
            # TODO: Implement conflict resolution
            return {"type": "success", "result": "conflict"}

        return {"type": "error", "message": "Failed to accept thread"}

    async def _handle_reject_thread(self, client_id: str, thread_id: str) -> Dict[str, Any]:
        """Reject thread changes."""
        thread = self._get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        if not thread.can_reject():
            return {"type": "error", "message": "Thread cannot be rejected"}

        success = thread.reject(self.wiki)

        if success:
            await self.broadcast({
                "type": "thread_status",
                "thread_id": thread_id,
                "status": "rejected",
                "message": "Changes rejected"
            })

            # Clean up executor
            await self._cleanup_executor(thread_id)

            # Refresh thread list
            for cid in self.connections:
                await self._send_thread_list(cid)

            return {"type": "success"}

        return {"type": "error", "message": "Failed to reject thread"}

    async def _handle_get_thread_diff(self, client_id: str, thread_id: str) -> Dict[str, Any]:
        """Get diff stats for a thread."""
        thread = self._get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        diff_stats = thread.get_diff_stats(self.wiki)
        if diff_stats:
            await self.send_message(client_id, {
                "type": "thread_diff",
                "thread_id": thread_id,
                "diff_stats": diff_stats
            })
            return {"type": "success"}

        return {"type": "error", "message": "Failed to get diff stats"}

    async def _handle_reset(self, client_id: str) -> Dict[str, Any]:
        """Reset user's assistant conversation."""
        # Archive old assistant
        assistant = AssistantThread.get_or_create_for_user(client_id)
        if assistant:
            assistant.archive()
            await self._cleanup_executor(assistant.id)
            self._remove_from_cache(assistant.id)

        # Create new assistant
        new_assistant = AssistantThread.create(client_id)
        self._cache_thread(new_assistant)
        self.client_view[client_id] = new_assistant.id

        await self._start_executor(new_assistant, client_id)

        await self.send_message(client_id, {
            "type": "thread_selected",
            "thread_id": new_assistant.id,
            "thread_type": "assistant",
            "history": []
        })

        await self._send_thread_list(client_id)

        return {"type": "success", "message": "Conversation reset"}

    async def _cleanup_thread(self, thread_id: str):
        """Clean up a thread completely."""
        thread = self._get_thread(thread_id)

        # Clean up executor
        await self._cleanup_executor(thread_id)

        # Clean up git resources (for threads with branch management)
        if thread and hasattr(thread, 'cleanup_branch'):
            thread.cleanup_branch(self.wiki, delete_branch=True)

        # Remove from cache
        self._remove_from_cache(thread_id)


# ─────────────────────────────────────────────────────────────────────────────
# Global Instance & WebSocket Endpoint
# ─────────────────────────────────────────────────────────────────────────────

thread_manager: Optional[ThreadManager] = None


def initialize_thread_manager(wiki: GitWiki, api_key: str = None):
    """Initialize the global thread manager."""
    global thread_manager
    thread_manager = ThreadManager(wiki, api_key)
    print("✅ Thread manager initialized")


async def websocket_endpoint(websocket: WebSocket, client_id: str = "default"):
    """WebSocket endpoint handler."""
    if thread_manager is None:
        await websocket.close(code=1011, reason="Server not ready")
        return

    await thread_manager.connect(websocket, client_id)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message_data = json.loads(data)
            except json.JSONDecodeError:
                await thread_manager.send_message(client_id, {
                    "type": "error",
                    "message": "Invalid JSON format"
                })
                continue

            response = await thread_manager.handle_message(client_id, message_data)
            if response.get("type") in ["error", "success"]:
                await thread_manager.send_message(client_id, response)

    except WebSocketDisconnect:
        await thread_manager.disconnect(client_id)
    except Exception:
        import traceback
        traceback.print_exc()
        await thread_manager.disconnect(client_id)
