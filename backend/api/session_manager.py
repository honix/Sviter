"""
Unified session manager for wiki agents.

Handles:
- Main chat sessions (read-only assistant)
- Thread sessions (autonomous workers on branches)
- WebSocket communication
"""

from fastapi import WebSocket, WebSocketDisconnect
from agents.executor import AgentExecutor
from storage import GitWiki
from threads.thread import Thread, ThreadStatus
from threads.accept_result import AcceptResult
from ai.prompts import ASSISTANT_PROMPT, THREAD_PROMPT
from threads import git_operations as git_ops
from ai.tools import ToolBuilder
import json
from typing import Dict, Any, Optional, List, Callable, Set
from dataclasses import dataclass
from enum import Enum
import asyncio
import os


class SessionType(Enum):
    MAIN = "main"
    THREAD = "thread"


@dataclass
class Session:
    """Session metadata."""
    id: str
    type: SessionType
    client_id: str
    executor: AgentExecutor
    tools: List = None
    # Thread-specific
    thread: Optional[Thread] = None


class SessionManager:
    """
    Unified manager for all agent sessions.

    Handles both main (assistant) and thread (worker) sessions
    with shared executor/callback infrastructure.
    """

    def __init__(self, wiki: GitWiki, api_key: str = None):
        self.wiki = wiki
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")

        # WebSocket connections: client_id -> WebSocket
        self.connections: Dict[str, WebSocket] = {}

        # Sessions: session_id -> Session
        self.sessions: Dict[str, Session] = {}

        # Main session per client: client_id -> session_id
        self.main_sessions: Dict[str, str] = {}

        # Thread sessions: thread_id -> session_id
        self.thread_sessions: Dict[str, str] = {}

        # Client's threads: client_id -> set of thread_ids
        self.client_threads: Dict[str, Set[str]] = {}

        # Current view per client: client_id -> "main" | thread_id
        self.client_view: Dict[str, str] = {}

        # Background tasks: session_id -> asyncio.Task
        self.tasks: Dict[str, asyncio.Task] = {}

    # ─────────────────────────────────────────────────────────────────────────
    # WebSocket Connection
    # ─────────────────────────────────────────────────────────────────────────

    async def connect(self, websocket: WebSocket, client_id: str):
        """Accept WebSocket connection and initialize main session."""
        await websocket.accept()
        self.connections[client_id] = websocket
        self.client_view[client_id] = "main"

        # Start main session
        await self._start_main_session(client_id)

    async def disconnect(self, client_id: str):
        """Clean up connection and main session, but keep threads."""
        # End main session
        if client_id in self.main_sessions:
            session_id = self.main_sessions.pop(client_id)
            await self._cleanup_session(session_id)

        # Keep all threads on disconnect - user might reconnect
        # Threads persist until explicitly accepted/rejected or server restart

        # Clear client state (but keep client_threads mapping for reconnection)
        self.client_view.pop(client_id, None)
        self.connections.pop(client_id, None)

    async def send_message(self, client_id: str, message: Dict[str, Any]):
        """Send message to client."""
        if client_id in self.connections:
            try:
                await self.connections[client_id].send_text(json.dumps(message))
            except Exception as e:
                if "connection closed" in str(e).lower():
                    await self.disconnect(client_id)

    # ─────────────────────────────────────────────────────────────────────────
    # Session Management (shared for main and threads)
    # ─────────────────────────────────────────────────────────────────────────

    async def _start_session(
        self,
        session_id: str,
        session_type: SessionType,
        client_id: str,
        system_prompt: str,
        on_message: Callable,
        on_tool_call: Callable,
        thread: Thread = None,
    ) -> bool:
        """Start a new session (main or thread)."""
        executor = AgentExecutor(wiki=self.wiki, api_key=self.api_key)

        result = await executor.start_session(
            system_prompt=system_prompt,
            model="claude-sonnet-4-5",
            provider="claude",
            human_in_loop=(session_type == SessionType.MAIN),
            agent_name="Assistant" if session_type == SessionType.MAIN else thread.name,
            on_message=on_message,
            on_tool_call=on_tool_call,
        )

        if not result["success"]:
            return False

        session = Session(
            id=session_id,
            type=session_type,
            client_id=client_id,
            executor=executor,
            thread=thread,
        )
        self.sessions[session_id] = session

        return True

    async def _cleanup_session(self, session_id: str):
        """Clean up a session."""
        # Cancel background task
        if session_id in self.tasks:
            self.tasks[session_id].cancel()
            del self.tasks[session_id]

        # End executor
        session = self.sessions.pop(session_id, None)
        if session:
            try:
                await session.executor.end_session(call_on_finish=False)
            except Exception:
                pass

    # ─────────────────────────────────────────────────────────────────────────
    # Main Session
    # ─────────────────────────────────────────────────────────────────────────

    async def _start_main_session(self, client_id: str):
        """Initialize main assistant session for client."""
        session_id = f"main:{client_id}"

        async def on_message(msg_type: str, content: str):
            if msg_type == "system_prompt":
                await self.send_message(client_id, {"type": "system_prompt", "content": content})
            elif msg_type == "assistant":
                await self.send_message(client_id, {"type": "chat_response", "message": content})

        async def on_tool_call(tool_info: Dict[str, Any]):
            await self.send_message(client_id, {
                "type": "tool_call",
                "tool_name": tool_info["tool_name"],
                "arguments": tool_info["arguments"],
                "result": tool_info["result"],
                "iteration": tool_info["iteration"]
            })

        success = await self._start_session(
            session_id=session_id,
            session_type=SessionType.MAIN,
            client_id=client_id,
            system_prompt=ASSISTANT_PROMPT,
            on_message=on_message,
            on_tool_call=on_tool_call,
        )

        if success:
            self.main_sessions[client_id] = session_id

            # Send thread list on connect
            threads = self._list_threads(client_id)
            if threads:
                await self.send_message(client_id, {
                    "type": "thread_list",
                    "threads": [t.to_dict() for t in threads]
                })
        else:
            await self.send_message(client_id, {
                "type": "error",
                "message": "Failed to start session"
            })

    # ─────────────────────────────────────────────────────────────────────────
    # Thread Management
    # ─────────────────────────────────────────────────────────────────────────

    def _get_thread(self, thread_id: str) -> Optional[Thread]:
        """Get thread by ID."""
        session_id = self.thread_sessions.get(thread_id)
        if session_id and session_id in self.sessions:
            return self.sessions[session_id].thread
        return None

    def _list_threads(self, client_id: str) -> List[Thread]:
        """List all threads for a client."""
        if client_id not in self.client_threads:
            return []
        return [
            self._get_thread(tid) for tid in self.client_threads[client_id]
            if self._get_thread(tid) is not None
        ]

    def _create_thread(self, name: str, goal: str, client_id: str) -> Thread:
        """Create a new thread with git branch and worktree."""
        thread = Thread.create(name, goal, client_id)

        # Create git branch
        error = git_ops.prepare_branch(self.wiki, thread.branch)
        if error:
            thread.set_error(error)
            return thread

        # Create worktree for concurrent execution
        try:
            worktree_path = git_ops.create_worktree(self.wiki, thread.branch)
            thread.worktree_path = str(worktree_path)
        except Exception as e:
            thread.set_error(f"Failed to create worktree: {e}")
            # Clean up the branch if worktree creation failed
            git_ops.delete_thread_branch(self.wiki, thread.branch)
            return thread

        # Track thread
        if client_id not in self.client_threads:
            self.client_threads[client_id] = set()
        self.client_threads[client_id].add(thread.id)

        return thread

    async def _start_thread(self, thread: Thread, client_id: str):
        """Start thread execution using thread's own worktree."""
        session_id = f"thread:{thread.id}"

        # Create GitWiki instance for this thread's worktree
        if not thread.worktree_path:
            thread.set_error("Thread has no worktree path")
            return False

        thread_wiki = GitWiki(thread.worktree_path)

        # Status change callback
        async def on_status_change(status: str, message: str):
            await self.send_message(client_id, {
                "type": "thread_status",
                "thread_id": thread.id,
                "status": status,
                "message": message
            })
            # Send updated thread list
            threads = self._list_threads(client_id)
            await self.send_message(client_id, {
                "type": "thread_list",
                "threads": [t.to_dict() for t in threads]
            })

        # Tool callbacks for request_help and mark_for_review
        def on_request_help(question: str):
            thread.set_status(ThreadStatus.NEED_HELP)
            thread.add_message("system", f"Requesting help: {question}")
            asyncio.create_task(on_status_change("need_help", question))

        def on_mark_for_review(summary: str):
            thread.set_status(ThreadStatus.REVIEW, summary)
            thread.add_message("system", f"Marked for review: {summary}")
            asyncio.create_task(on_status_change("review", summary))

        # Message callback
        async def on_message(msg_type: str, content: str):
            if msg_type == "assistant":
                thread.add_message("assistant", content)
            elif msg_type == "system_prompt":
                thread.add_message("system", content)
            await self.send_message(client_id, {
                "type": "thread_message",
                "thread_id": thread.id,
                "role": msg_type,
                "content": content
            })

        # Tool call callback
        async def on_tool_call(tool_info: Dict[str, Any]):
            thread.add_message(
                "tool_call", tool_info.get("result", ""),
                tool_name=tool_info.get("tool_name"),
                tool_args=tool_info.get("arguments"),
                tool_result=tool_info.get("result")
            )
            await self.send_message(client_id, {
                "type": "thread_message",
                "thread_id": thread.id,
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
                })

        # Start session
        success = await self._start_session(
            session_id=session_id,
            session_type=SessionType.THREAD,
            client_id=client_id,
            system_prompt=THREAD_PROMPT.format(goal=thread.goal, branch=thread.branch),
            on_message=on_message,
            on_tool_call=on_tool_call,
            thread=thread,
        )

        if not success:
            return False

        self.thread_sessions[thread.id] = session_id

        # Get tools using thread's own wiki (worktree)
        tools = ToolBuilder.for_thread(thread_wiki, on_request_help, on_mark_for_review)
        self.sessions[session_id].tools = tools

        # Run thread execution in background
        task = asyncio.create_task(self._run_thread(thread, client_id, session_id, tools))
        self.tasks[session_id] = task

        return True

    async def _run_thread(self, thread: Thread, client_id: str, session_id: str, tools: List):
        """Execute thread until completion or status change."""
        session = self.sessions.get(session_id)
        if not session:
            return

        try:
            # Initial turn
            initial = f"Your goal: {thread.goal}\n\nBegin working on this task."
            thread.add_message("user", initial)
            # Send user message to frontend
            await self.send_message(client_id, {
                "type": "thread_message",
                "thread_id": thread.id,
                "role": "user",
                "content": initial
            })
            result = await session.executor.process_turn(initial, custom_tools=tools)

            # Continue until status changes
            while thread.status == ThreadStatus.WORKING:
                if result.status in ['completed', 'stopped']:
                    if thread.status == ThreadStatus.WORKING:
                        thread.set_status(ThreadStatus.REVIEW, "Task completed")
                        await self.send_message(client_id, {
                            "type": "thread_status",
                            "thread_id": thread.id,
                            "status": "review",
                            "message": "Task completed"
                        })
                        threads = self._list_threads(client_id)
                        await self.send_message(client_id, {
                            "type": "thread_list",
                            "threads": [t.to_dict() for t in threads]
                        })
                    break
                elif result.status == 'error':
                    thread.set_error(result.error)
                    thread.set_status(ThreadStatus.NEED_HELP)
                    await self.send_message(client_id, {
                        "type": "thread_status",
                        "thread_id": thread.id,
                        "status": "need_help",
                        "message": f"Error: {result.error}"
                    })
                    break

                await asyncio.sleep(0.1)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            thread.set_error(str(e))
            thread.set_status(ThreadStatus.NEED_HELP)
        # No return_to_main needed - thread uses its own worktree

    async def _cleanup_thread(self, thread_id: str):
        """Clean up thread, its worktree, branch, and session."""
        # Get thread for cleanup
        thread = self._get_thread(thread_id)
        if thread:
            # Remove worktree first (must be done before deleting branch)
            git_ops.remove_worktree(self.wiki, thread.branch)
            # Then delete the branch
            git_ops.delete_thread_branch(self.wiki, thread.branch)

        # Cleanup session
        session_id = self.thread_sessions.pop(thread_id, None)
        if session_id:
            await self._cleanup_session(session_id)

        # Remove from client tracking
        for client_threads in self.client_threads.values():
            client_threads.discard(thread_id)

    async def _accept_thread(self, thread_id: str) -> AcceptResult:
        """Accept thread changes - merge to main, cleanup worktree."""
        thread = self._get_thread(thread_id)
        if not thread or thread.status != ThreadStatus.REVIEW:
            return AcceptResult.ERROR

        result = git_ops.merge_thread(self.wiki, thread.branch)

        if result["success"]:
            # Clean up worktree only, keep branch for history
            git_ops.remove_worktree(self.wiki, thread.branch)
            thread.set_status(ThreadStatus.ACCEPTED)
            return AcceptResult.SUCCESS

        if result["conflict"]:
            await self._resolve_conflicts(thread_id)
            return AcceptResult.CONFLICT

        thread.set_error(f"Merge failed: {result['error']}")
        return AcceptResult.ERROR

    async def _reject_thread(self, thread_id: str) -> bool:
        """Reject thread changes - cleanup worktree but keep branch for history."""
        thread = self._get_thread(thread_id)
        if not thread:
            return False

        # Clean up worktree only, keep branch for history
        git_ops.remove_worktree(self.wiki, thread.branch)
        thread.set_status(ThreadStatus.REJECTED)
        return True

    async def _resolve_conflicts(self, thread_id: str):
        """Auto-resolve merge conflicts using thread's worktree."""
        thread = self._get_thread(thread_id)
        session_id = self.thread_sessions.get(thread_id)
        session = self.sessions.get(session_id) if session_id else None

        if not thread or not session or not thread.worktree_path:
            return

        thread.set_status(ThreadStatus.WORKING)
        client_id = thread.client_id

        await self.send_message(client_id, {
            "type": "thread_status",
            "thread_id": thread_id,
            "status": "working",
            "message": "Resolving merge conflicts"
        })

        try:
            # Create GitWiki for thread's worktree to perform merge
            thread_wiki = GitWiki(thread.worktree_path)
            git_ops.merge_main_into_thread(thread_wiki, thread.branch)

            resolve_msg = """
There are merge conflicts with the main branch. Please:
1. Review the conflicted files
2. Resolve the conflicts by editing the files
3. When done, call mark_for_review() again
"""
            thread.add_message("user", resolve_msg)
            await session.executor.process_turn(resolve_msg, custom_tools=session.tools)
            # No return_to_main needed - thread uses its own worktree

        except Exception as e:
            thread.set_error(f"Conflict resolution failed: {e}")
            thread.set_status(ThreadStatus.NEED_HELP)

    # ─────────────────────────────────────────────────────────────────────────
    # Message Handling
    # ─────────────────────────────────────────────────────────────────────────

    async def handle_message(self, client_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming WebSocket message."""
        message_type = message_data.get("type")

        if message_type == "chat":
            current_view = self.client_view.get(client_id, "main")
            if current_view == "main":
                return await self._handle_main_chat(client_id, message_data)
            else:
                return await self._handle_thread_chat(client_id, current_view, message_data)

        elif message_type == "select_thread":
            return await self._handle_select_thread(client_id, message_data.get("thread_id"))

        elif message_type == "accept_thread":
            return await self._handle_accept_thread(client_id, message_data.get("thread_id"))

        elif message_type == "reject_thread":
            return await self._handle_reject_thread(client_id, message_data.get("thread_id"))

        elif message_type == "get_thread_list":
            threads = self._list_threads(client_id)
            await self.send_message(client_id, {
                "type": "thread_list",
                "threads": [t.to_dict() for t in threads]
            })
            return {"type": "success"}

        elif message_type == "get_thread_diff":
            return await self._handle_get_thread_diff(client_id, message_data.get("thread_id"))

        elif message_type == "reset":
            # Reset main conversation
            if client_id in self.main_sessions:
                await self._cleanup_session(self.main_sessions[client_id])
                del self.main_sessions[client_id]
            self.client_view[client_id] = "main"
            await self._start_main_session(client_id)
            return {"type": "success", "message": "Conversation reset"}

        return {"type": "error", "message": f"Unknown message type: {message_type}"}

    async def _handle_main_chat(self, client_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle chat in main mode."""
        user_message = message_data.get("message", "")
        if not user_message:
            return {"type": "error", "message": "Empty message"}

        session_id = self.main_sessions.get(client_id)
        session = self.sessions.get(session_id) if session_id else None
        if not session:
            return {"type": "error", "message": "Main session not found"}

        # Spawn thread callback
        def spawn_callback(name: str, goal: str) -> Dict[str, Any]:
            thread = self._create_thread(name, goal, client_id)
            asyncio.create_task(self._start_thread_with_notifications(thread, client_id))
            return thread.to_dict()

        def list_callback():
            return [t.to_dict() for t in self._list_threads(client_id)]

        tools = ToolBuilder.for_main(self.wiki, spawn_callback, list_callback)
        result = await session.executor.process_turn(user_message, custom_tools=tools)

        if result.status in ['completed', 'stopped']:
            return {"type": "success"}
        elif result.status == 'error':
            return {"type": "error", "message": result.error}
        return {"type": "error", "message": f"Unexpected status: {result.status}"}

    async def _start_thread_with_notifications(self, thread: Thread, client_id: str):
        """Start thread and send notifications."""
        await self.send_message(client_id, {
            "type": "thread_created",
            "thread": thread.to_dict()
        })

        try:
            success = await self._start_thread(thread, client_id)
            if not success:
                await self._cleanup_thread(thread.id)
                await self.send_message(client_id, {
                    "type": "thread_deleted",
                    "thread_id": thread.id,
                    "reason": "start_failed"
                })
        except Exception as e:
            await self._cleanup_thread(thread.id)
            await self.send_message(client_id, {
                "type": "thread_deleted",
                "thread_id": thread.id,
                "reason": f"error: {e}"
            })

    async def _handle_thread_chat(self, client_id: str, thread_id: str, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle chat to a thread."""
        user_message = message_data.get("message", "")
        if not user_message:
            return {"type": "error", "message": "Empty message"}

        thread = self._get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        session_id = self.thread_sessions.get(thread_id)
        session = self.sessions.get(session_id) if session_id else None
        if not session:
            return {"type": "error", "message": "Thread session not found"}

        # Resume if waiting for input
        if thread.status in (ThreadStatus.NEED_HELP, ThreadStatus.REVIEW):
            thread.set_status(ThreadStatus.WORKING)
            await self.send_message(client_id, {
                "type": "thread_status",
                "thread_id": thread_id,
                "status": "working",
                "message": "Resuming work"
            })

        # Process message if thread is working
        # Thread uses its own worktree, no checkout needed
        if thread.status == ThreadStatus.WORKING:
            thread.add_message("user", user_message)
            # Send user message to frontend
            await self.send_message(client_id, {
                "type": "thread_message",
                "thread_id": thread_id,
                "role": "user",
                "content": user_message
            })
            result = await session.executor.process_turn(user_message, custom_tools=session.tools)

            if result.status == 'error':
                thread.set_error(result.error)
                thread.set_status(ThreadStatus.NEED_HELP)

        return {"type": "success"}

    async def _handle_select_thread(self, client_id: str, thread_id: Optional[str]) -> Dict[str, Any]:
        """Switch view to thread or main."""
        if thread_id is None:
            self.client_view[client_id] = "main"
            session_id = self.main_sessions.get(client_id)
            session = self.sessions.get(session_id) if session_id else None
            if session:
                history = session.executor.get_conversation_history()
                await self.send_message(client_id, {
                    "type": "thread_selected",
                    "thread_id": None,
                    "history": history
                })
            return {"type": "success"}

        thread = self._get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        self.client_view[client_id] = thread_id
        await self.send_message(client_id, {
            "type": "thread_selected",
            "thread_id": thread_id,
            "thread": thread.to_dict(),
            "history": [m.to_dict() for m in thread.conversation]
        })
        return {"type": "success"}

    async def _handle_accept_thread(self, client_id: str, thread_id: str) -> Dict[str, Any]:
        """Accept thread changes."""
        thread = self._get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        result = await self._accept_thread(thread_id)

        if result == AcceptResult.SUCCESS:
            await self.send_message(client_id, {
                "type": "thread_status",
                "thread_id": thread_id,
                "status": "accepted",
                "message": "Changes merged to main"
            })
            self.client_view[client_id] = "main"
            threads = self._list_threads(client_id)
            await self.send_message(client_id, {
                "type": "thread_list",
                "threads": [t.to_dict() for t in threads]
            })
            await self.send_message(client_id, {"type": "pages_changed"})
            return {"type": "success", "result": "accepted"}

        elif result == AcceptResult.CONFLICT:
            await self.send_message(client_id, {
                "type": "accept_conflict",
                "thread_id": thread_id,
                "message": "Merge conflict detected. Agent is resolving..."
            })
            return {"type": "success", "result": "conflict"}

        return {"type": "error", "message": "Failed to accept thread"}

    async def _handle_reject_thread(self, client_id: str, thread_id: str) -> Dict[str, Any]:
        """Reject thread changes."""
        success = await self._reject_thread(thread_id)

        if success:
            await self.send_message(client_id, {
                "type": "thread_status",
                "thread_id": thread_id,
                "status": "rejected",
                "message": "Changes rejected"
            })
            self.client_view[client_id] = "main"
            threads = self._list_threads(client_id)
            await self.send_message(client_id, {
                "type": "thread_list",
                "threads": [t.to_dict() for t in threads]
            })
            return {"type": "success"}

        return {"type": "error", "message": "Failed to reject thread"}

    async def _handle_get_thread_diff(self, client_id: str, thread_id: str) -> Dict[str, Any]:
        """Get diff stats for thread."""
        thread = self._get_thread(thread_id)
        if not thread:
            return {"type": "error", "message": "Thread not found"}

        diff_stats = git_ops.get_diff_stats(self.wiki, thread.branch)
        if diff_stats:
            await self.send_message(client_id, {
                "type": "thread_diff",
                "thread_id": thread_id,
                "diff_stats": diff_stats
            })
            return {"type": "success"}

        return {"type": "error", "message": "Failed to get diff stats"}


# ─────────────────────────────────────────────────────────────────────────────
# Global Instance & WebSocket Endpoint
# ─────────────────────────────────────────────────────────────────────────────

session_manager: Optional[SessionManager] = None


def initialize_session_manager(wiki: GitWiki, api_key: str = None):
    """Initialize the global session manager."""
    global session_manager
    session_manager = SessionManager(wiki, api_key)
    print("✅ Session manager initialized")


async def websocket_endpoint(websocket: WebSocket, client_id: str = "default"):
    """WebSocket endpoint handler."""
    if session_manager is None:
        await websocket.close(code=1011, reason="Server not ready")
        return

    await session_manager.connect(websocket, client_id)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message_data = json.loads(data)
            except json.JSONDecodeError:
                await session_manager.send_message(client_id, {
                    "type": "error",
                    "message": "Invalid JSON format"
                })
                continue

            response = await session_manager.handle_message(client_id, message_data)
            if response.get("type") in ["error", "success"]:
                await session_manager.send_message(client_id, response)

    except WebSocketDisconnect:
        await session_manager.disconnect(client_id)
    except Exception:
        await session_manager.disconnect(client_id)
