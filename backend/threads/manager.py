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

from config import LLM_MODEL, LLM_PROVIDER
from storage import GitWiki
from agents.executor import AgentExecutor
from utils import wrap_system_notification
from threads.base import Thread, ThreadStatus
from threads.assistant import AssistantThread
from threads.worker import WorkerThread
from threads.accept_result import AcceptResult
from threads.commands import parse_command, CommandType, ParsedCommand
from threads.mentions import parse_mentions, is_ai_addressed
from db import (
    get_or_create_guest,
    get_thread as db_get_thread,
    get_user,
    get_user_by_email,
    list_threads_for_user,
    list_worker_threads,
    can_access_thread,
    add_attention,
    clear_attention,
)


class ThreadManager:
    """
    Unified manager for all thread operations.

    Manages WebSocket connections, thread execution, and message routing.
    All thread state is persisted to SQLite via Thread classes.
    """

    def __init__(self, wiki: GitWiki, api_key: str = None, collab_manager=None):
        self.wiki = wiki  # Main wiki (on main branch)
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        self.collab_manager = collab_manager  # For checking active editors

        # WebSocket connections: client_id -> List[WebSocket]
        # Supports multiple windows/tabs per user
        self.connections: Dict[str, List[WebSocket]] = {}

        # Active executors: thread_id -> AgentExecutor
        self.executors: Dict[str, AgentExecutor] = {}

        # Background tasks: thread_id -> asyncio.Task
        self.tasks: Dict[str, asyncio.Task] = {}

        # Current view per client: client_id -> thread_id (which thread they're viewing)
        self.client_view: Dict[str, str] = {}

        # In-memory thread cache: thread_id -> Thread instance
        # Threads are loaded from DB on demand and cached here
        self._thread_cache: Dict[str, Thread] = {}

    def set_collab_manager(self, collab_manager):
        """Set the collab manager reference (for late binding)."""
        self.collab_manager = collab_manager
        # Register for room change events
        if collab_manager:
            collab_manager.on_room_change(self._on_collab_room_change)

    async def _on_collab_room_change(self, room_name: str, client_id: str, action: str):
        """Handle collab room changes - broadcast to all clients."""
        await self.broadcast({
            "type": "collab_room_change",
            "room": room_name,
            "client_id": client_id,
            "action": action,  # "join" or "leave"
            "active_rooms": self.collab_manager.get_active_rooms() if self.collab_manager else {}
        })

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

    # ─────────────────────────────────────────────────────────────────────────
    # Merge Blocking (Collab Integration)
    # ─────────────────────────────────────────────────────────────────────────

    def get_thread_affected_pages(self, thread_id: str) -> List[str]:
        """Get list of page paths affected by a thread's changes."""
        thread = self._get_thread(thread_id)
        if not thread or not hasattr(thread, 'branch') or not thread.branch:
            return []

        try:
            diff_stats = self.wiki.get_diff_stats_by_page("main", thread.branch)
            return list(diff_stats.keys())
        except Exception as e:
            print(f"Error getting affected pages for thread {thread_id}: {e}")
            return []

    def get_merge_block_status(self, thread_id: str) -> Dict[str, Any]:
        """
        Check if a thread's merge is blocked by active editors.

        Returns:
            {
                "blocked": bool,
                "affected_pages": [str],  # pages affected by thread
                "blocked_pages": {page: [client_ids]},  # pages being edited
            }
        """
        affected_pages = self.get_thread_affected_pages(thread_id)

        if not self.collab_manager:
            print(f"🔍 Merge status: No collab manager, not blocked")
            return {
                "blocked": False,
                "affected_pages": affected_pages,
                "blocked_pages": {}
            }

        # Debug: show active editors (not just viewers)
        active_editors = self.collab_manager.get_active_editors()
        print(f"🔍 Merge status for thread {thread_id}:")
        print(f"   Affected pages: {affected_pages}")
        print(f"   Active editors: {active_editors}")

        # Check which affected pages have active editors
        blocked_pages = self.collab_manager.get_editors_for_pages(affected_pages)
        print(f"   Blocked pages: {blocked_pages}")

        return {
            "blocked": len(blocked_pages) > 0,
            "affected_pages": affected_pages,
            "blocked_pages": {k: list(v) for k, v in blocked_pages.items()}
        }

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

        # Add to connections list (supports multiple windows per user)
        if client_id not in self.connections:
            self.connections[client_id] = []
        self.connections[client_id].append(websocket)

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

        # Force reload messages from DB BEFORE starting executor
        assistant.reload_messages()

        # Start executor for assistant if not exists
        if assistant.id not in self.executors:
            await self._start_executor(assistant, client_id)

        # Build history with system prompt at the start
        system_prompt_msg = {
            "id": f"sysprompt_{assistant.id}",
            "role": "system_prompt",
            "content": assistant.get_prompt(),
            "timestamp": assistant.messages[0].created_at.isoformat() if assistant.messages else None
        }
        history = [system_prompt_msg] + [m.to_dict() for m in assistant.messages]

        # Send initial state to client
        await self.send_message(client_id, {
            "type": "thread_selected",
            "thread_id": assistant.id,
            "thread_type": "assistant",
            "history": history
        })

        # Send thread list
        await self._send_thread_list(client_id)

    async def disconnect(self, client_id: str, websocket: WebSocket = None):
        """Clean up connection but keep threads (they persist in DB)."""
        if client_id in self.connections:
            if websocket:
                # Remove specific websocket
                try:
                    self.connections[client_id].remove(websocket)
                except ValueError:
                    pass
                # Remove client_id entry if no more connections
                if not self.connections[client_id]:
                    del self.connections[client_id]
                    # Only clear view if all connections closed
                    self.client_view.pop(client_id, None)
            else:
                # Remove all connections for this client
                del self.connections[client_id]
                self.client_view.pop(client_id, None)

        print(f"👋 User disconnected: {client_id}")

    async def send_message(self, client_id: str, message: Dict[str, Any]):
        """Send message to all windows/tabs for a specific client."""
        if client_id in self.connections:
            closed_sockets = []
            for ws in self.connections[client_id]:
                try:
                    await ws.send_text(json.dumps(message))
                except Exception as e:
                    if "connection closed" in str(e).lower():
                        closed_sockets.append(ws)
            # Clean up closed sockets
            for ws in closed_sockets:
                await self.disconnect(client_id, ws)

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast message to ALL connected clients (all windows/tabs)."""
        disconnected = []
        for client_id, websockets in self.connections.items():
            for ws in websockets:
                try:
                    await ws.send_text(json.dumps(message))
                except Exception:
                    disconnected.append((client_id, ws))

        for client_id, ws in disconnected:
            await self.disconnect(client_id, ws)

    async def broadcast_to_thread_viewers(self, thread_id: str, message: Dict[str, Any]):
        """Broadcast message to clients viewing a specific thread."""
        for client_id, viewing_thread_id in self.client_view.items():
            if viewing_thread_id == thread_id:
                await self.send_message(client_id, message)

    async def _send_thread_list(self, client_id: str):
        """Send thread list to client with merge status for review threads."""
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
                # Add merge status for threads in review
                if t.get('status') == 'review':
                    merge_status = self.get_merge_block_status(t['id'])
                    t['merge_blocked'] = merge_status['blocked']
                    t['blocked_pages'] = merge_status.get('blocked_pages', {})
                threads.append(t)

        await self.send_message(client_id, {
            "type": "thread_list",
            "threads": threads,
            "active_rooms": self.collab_manager.get_active_rooms() if self.collab_manager else {}
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

            # Notify page updates for any write operation
            tool_name = tool_info.get("tool_name", "")
            if tool_name in ("edit_page", "write_page", "insert_at_line", "delete_page", "move_page"):
                # Get the page path from args (could be "path" or "title")
                args = tool_info.get("arguments", {})
                page_path = args.get("path") or args.get("title")
                await self.broadcast({
                    "type": "page_updated",
                    "title": page_path,
                    "operation": tool_name
                })

        # Start session
        result = await executor.start_session(
            system_prompt=thread.get_prompt(),
            model=LLM_MODEL,
            provider=LLM_PROVIDER,
            human_in_loop=True,  # All threads are human-in-loop
            agent_name=thread.name,
            on_message=on_message,
            on_tool_call=on_tool_call,
        )

        if not result["success"]:
            return False

        # Restore conversation history from thread's persisted messages
        if thread.messages:
            executor.restore_history([m.to_dict() for m in thread.messages])
            print(f"📜 Restored {len(thread.messages)} messages for thread {thread.id}")

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

    def _create_worker_thread(self, name: str, goal: str, client_id: str,
                               collaborative: bool = False,
                               participants: List[str] = None) -> WorkerThread:
        """
        Create a new worker thread with git branch.

        Args:
            name: Thread name
            goal: Task goal/description
            client_id: Owner user ID
            collaborative: If True, use collaborative mode (AI as participant)
            participants: List of user IDs to add as participants
        """
        thread = WorkerThread.create(
            owner_id=client_id,
            name=name,
            goal=goal,
            collaborative=collaborative
        )

        # Initialize git branch and worktree
        error = thread.initialize_branch(self.wiki)
        if error:
            thread.set_error(error)

        # Add participants
        if participants:
            for user_id in participants:
                thread.add_participant(user_id)
                # Add attention for being added to thread
                add_attention(thread.id, user_id, "added")

        self._cache_thread(thread)
        return thread

    async def _handle_thread_command(self, client_id: str, cmd: ParsedCommand) -> Dict[str, Any]:
        """
        Handle /thread command to create a user-initiated collaborative thread.

        Format: /thread <name> [@participant ...] [goal message]
        """
        if not cmd.name:
            return {"type": "error", "message": "Thread name required: /thread <name> [@participants] [goal]"}

        # Create collaborative thread
        goal = cmd.message or f"Collaborative work on {cmd.name}"
        thread = self._create_worker_thread(
            name=cmd.name,
            goal=goal,
            client_id=client_id,
            collaborative=True,
            participants=cmd.participants
        )

        # Broadcast thread creation
        await self.broadcast({
            "type": "thread_created",
            "thread": thread.to_dict()
        })

        # Switch user to the new thread
        self.client_view[client_id] = thread.id

        # Start executor for the thread (collaborative threads wait for messages)
        await self._start_executor(thread, client_id)

        # Send thread selected to the creator
        await self.send_message(client_id, {
            "type": "thread_selected",
            "thread_id": thread.id,
            "thread_type": "worker",
            "thread": thread.to_dict(),
            "history": []
        })

        # Update thread list for all clients
        for cid in self.connections:
            await self._send_thread_list(cid)

        return {"type": "success", "thread_id": thread.id}

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
                    result = await executor.process_turn(wrap_system_notification(prompt_message), custom_tools=tools)
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
        finally:
            # Clean up executor when thread finishes (REVIEW, NEED_HELP, or error)
            # This disconnects the Claude SDK client to prevent CPU spinning
            if thread.is_finished() or thread.status in (ThreadStatus.REVIEW, ThreadStatus.NEED_HELP):
                await self._cleanup_executor(thread.id)

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

        elif message_type == "get_merge_status":
            thread_id = message_data.get("thread_id")
            if not thread_id:
                return {"type": "error", "message": "thread_id required"}
            status = self.get_merge_block_status(thread_id)
            return {"type": "merge_status", "thread_id": thread_id, **status}

        elif message_type == "get_active_rooms":
            rooms = self.collab_manager.get_active_rooms() if self.collab_manager else {}
            return {"type": "active_rooms", "rooms": rooms}

        elif message_type == "reset":
            return await self._handle_reset(client_id)

        return {"type": "error", "message": f"Unknown message type: {message_type}"}

    async def _handle_chat(self, client_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Unified chat handler for all thread types.

        Handles:
        - Slash commands (/thread, /approve, etc.)
        - Collaborative threads (AI only responds when addressed)
        - @mentions for attention tracking
        """
        user_message = message_data.get("message", "")
        if not user_message:
            return {"type": "error", "message": "Empty message"}

        # Check for slash commands first
        cmd = parse_command(user_message)
        if cmd:
            if cmd.type == CommandType.THREAD:
                return await self._handle_thread_command(client_id, cmd)
            elif cmd.type == CommandType.APPROVE:
                # Organic approval - approve current thread
                current_thread_id = self.client_view.get(client_id)
                if current_thread_id:
                    return await self._handle_accept_thread(client_id, current_thread_id)
                return {"type": "error", "message": "No thread selected to approve"}
            elif cmd.type == CommandType.REJECT:
                current_thread_id = self.client_view.get(client_id)
                if current_thread_id:
                    return await self._handle_reject_thread(client_id, current_thread_id)
                return {"type": "error", "message": "No thread selected to reject"}
            elif cmd.type == CommandType.UNKNOWN:
                return {"type": "error", "message": f"Unknown command: {cmd.raw}"}

        current_thread_id = self.client_view.get(client_id)
        if not current_thread_id:
            return {"type": "error", "message": "No thread selected"}

        thread = self._get_thread(current_thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        # Parse @mentions and add attention for mentioned users
        mentions = parse_mentions(user_message)
        for mentioned_user in mentions.user_mentions:
            # Try to find user by name/id
            if thread.is_participant(mentioned_user):
                add_attention(thread.id, mentioned_user, "mention")

        # Clear attention for the sender (they're actively participating)
        clear_attention(thread.id, client_id)

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
            result = await executor.process_turn(wrap_system_notification(prompt_message), custom_tools=tools)
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

        # Force reload messages from DB BEFORE starting executor
        thread.reload_messages()

        # Start executor if needed (for threads loaded from DB)
        if thread.id not in self.executors and not thread.is_finished():
            await self._start_executor(thread, client_id)

        # Build history with system prompt at the start
        system_prompt_msg = {
            "id": f"sysprompt_{thread_id}",
            "role": "system_prompt",
            "content": thread.get_prompt(),
            "timestamp": thread.messages[0].created_at.isoformat() if thread.messages else None
        }
        history = [system_prompt_msg] + [m.to_dict() for m in thread.messages]

        # Build thread data with current merge status for review threads
        thread_data = thread.to_dict()
        if thread.status == ThreadStatus.REVIEW:
            merge_status = self.get_merge_block_status(thread_id)
            thread_data['merge_blocked'] = merge_status['blocked']
            thread_data['blocked_pages'] = merge_status.get('blocked_pages', {})

        await self.send_message(client_id, {
            "type": "thread_selected",
            "thread_id": thread_id,
            "thread_type": thread.type.value,
            "thread": thread_data,
            "history": history
        })

        # Send agent_start if currently generating
        if thread.is_generating:
            await self.send_message(client_id, {
                "type": "agent_start",
                "thread_id": thread_id
            })

        return {"type": "success"}

    async def _handle_accept_thread(self, client_id: str, thread_id: str) -> Dict[str, Any]:
        """Accept thread changes with merge blocking and conflict detection."""
        print(f"🔄 _handle_accept_thread called: client={client_id}, thread_id={thread_id}")
        thread = self._get_thread(thread_id)
        if not thread:
            print(f"❌ Thread not found: {thread_id}")
            return {"type": "error", "message": "Thread not found"}

        print(f"📋 Thread found: status={thread.status}, branch={getattr(thread, 'branch', None)}")
        if not thread.can_accept():
            print(f"❌ Thread cannot be accepted: status={thread.status}")
            return {"type": "error", "message": "Thread cannot be accepted"}

        # Check if merge is blocked by active editors
        block_status = self.get_merge_block_status(thread_id)
        if block_status["blocked"]:
            blocked_pages = list(block_status["blocked_pages"].keys())
            return {
                "type": "error",
                "message": f"Cannot merge: pages being edited: {', '.join(blocked_pages)}",
                "blocked_pages": block_status["blocked_pages"]
            }

        # Check for conflicts by trying to merge main into thread first
        from threads import git_operations as git_ops
        if hasattr(thread, 'branch') and thread.branch:
            # Check if main has diverged from when thread was created
            has_conflicts = git_ops.check_merge_conflicts(self.wiki, thread.branch)

            if has_conflicts:
                # Trigger conflict resolution flow
                await self._trigger_conflict_resolution(client_id, thread)
                return {"type": "success", "result": "resolving_conflicts"}

        # Get affected pages BEFORE merge (diff will be empty after merge)
        affected_pages = self.get_thread_affected_pages(thread_id)
        print(f"🔍 Thread {thread_id} affects pages: {affected_pages}")

        # Get user info for merge commit author
        author_name = "System"
        author_email = None
        user = get_user(client_id)
        if user:
            author_name = user.get("name") or client_id
            author_email = user.get("email")

        # No conflicts, proceed with merge
        print(f"🚀 Calling thread.accept() for thread {thread_id}")
        result = thread.accept(self.wiki, author=author_name, author_email=author_email)
        print(f"📊 thread.accept() returned: {result}")

        if result == AcceptResult.SUCCESS:
            await self.broadcast({
                "type": "thread_status",
                "thread_id": thread_id,
                "status": "accepted",
                "message": "Changes merged to main"
            })
            if affected_pages:
                # FIRST: Invalidate room cache (close WebSockets, clear server state)
                # This MUST happen before broadcasting to prevent race conditions
                if self.collab_manager:
                    await self.collab_manager.invalidate_rooms(affected_pages)
                    print(f"🔄 Invalidated collab rooms for: {affected_pages}")

                # THEN: Tell clients to reload these specific pages
                await self.broadcast({
                    "type": "pages_content_changed",
                    "pages": affected_pages,
                    "reason": "thread_merged"
                })
                print(f"🔄 Notified clients to reload pages: {affected_pages}")

            # Clean up executor
            await self._cleanup_executor(thread_id)

            # Refresh thread list and pages
            for cid in self.connections:
                await self._send_thread_list(cid)
            await self.broadcast({"type": "pages_changed"})

            return {"type": "success", "result": "accepted"}

        elif result == AcceptResult.CONFLICT:
            # Unexpected conflict (should have been caught above)
            await self._trigger_conflict_resolution(client_id, thread)
            return {"type": "success", "result": "resolving_conflicts"}

        return {"type": "error", "message": "Failed to accept thread"}

    async def _trigger_conflict_resolution(self, client_id: str, thread: Thread) -> None:
        """Trigger agent-based conflict resolution for a thread."""
        from threads import git_operations as git_ops

        await self.broadcast({
            "type": "thread_status",
            "thread_id": thread.id,
            "status": "resolving",
            "message": "Merge conflicts detected. Agent is resolving..."
        })

        # Merge main into thread to surface conflicts
        thread_wiki = self._get_wiki_for_thread(thread)
        error = git_ops.merge_main_into_thread(thread_wiki, thread.branch)

        if error:
            await self.broadcast({
                "type": "thread_error",
                "thread_id": thread.id,
                "message": f"Failed to start conflict resolution: {error}"
            })
            return

        # Send system message to agent to resolve conflicts
        conflict_message = """MERGE CONFLICT DETECTED

The main branch has been updated since you started working. I've merged main into your branch.

Please review and resolve any conflicts:
1. Use read_page to check for conflict markers (<<<<<<< HEAD, =======, >>>>>>> main)
2. Edit the conflicting pages to resolve the conflicts
3. When all conflicts are resolved, use mark_for_review again

If the conflicts are complex and you need guidance, use request_help to ask the user."""

        # Add system message to thread
        thread.add_message("system", conflict_message)

        # Resume thread execution with conflict context
        if hasattr(thread, 'resume_working'):
            thread.resume_working()

        # Send updated history to all clients viewing this thread
        for cid, viewed_tid in self.client_view.items():
            if viewed_tid == thread.id:
                await self.send_message(cid, {
                    "type": "assistant_message",
                    "thread_id": thread.id,
                    "content": conflict_message,
                    "is_system": True
                })

        # Re-run the executor (restart if it was cleaned up)
        executor = self.executors.get(thread.id)
        if not executor:
            # Executor was cleaned up, restart it for conflict resolution
            await self._start_executor(thread, client_id)
            executor = self.executors.get(thread.id)

        if executor:
            wiki = self._get_wiki_for_thread(thread)
            callbacks = self._prepare_thread_callbacks(thread, client_id)
            tools = thread.get_tools(wiki, **callbacks)

            # Run in background
            task = asyncio.create_task(
                self._run_executor_with_message(executor, wrap_system_notification(conflict_message), tools, thread, client_id)
            )
            self.tasks[thread.id] = task

    async def _run_executor_with_message(
        self, executor: AgentExecutor, message: str, tools: List, thread: Thread, client_id: str
    ):
        """Run executor with a system message to resolve conflicts."""
        try:
            # process_turn takes user_message and custom_tools
            await executor.process_turn(user_message=message, custom_tools=tools)
        except Exception as e:
            print(f"Error in conflict resolution: {e}")
            import traceback
            traceback.print_exc()
            await self.send_message(client_id, {
                "type": "thread_error",
                "thread_id": thread.id,
                "message": f"Conflict resolution failed: {e}"
            })
        finally:
            # Clean up executor when done to prevent CPU spinning
            if thread.is_finished() or thread.status in (ThreadStatus.REVIEW, ThreadStatus.NEED_HELP):
                await self._cleanup_executor(thread.id)

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
        await thread_manager.disconnect(client_id, websocket)
    except Exception:
        import traceback
        traceback.print_exc()
        await thread_manager.disconnect(client_id, websocket)
