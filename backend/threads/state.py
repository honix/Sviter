"""
Thread state storage.

In-memory storage for threads, executors, and related data.
"""

import asyncio
from typing import Dict, List, Set, Optional, Callable, Any
from datetime import datetime

from agents.executor import AgentExecutor
from .models import Thread, ThreadStatus


class ThreadState:
    """
    In-memory storage for all thread-related state.

    Stores:
    - Threads by ID
    - Executors by thread ID
    - Background tasks by thread ID
    - Callbacks by thread ID
    - Tools by thread ID
    - Client-to-thread mapping
    """

    def __init__(self):
        # Thread storage: thread_id -> Thread
        self.threads: Dict[str, Thread] = {}

        # Executor storage: thread_id -> AgentExecutor
        self.executors: Dict[str, AgentExecutor] = {}

        # Background tasks: thread_id -> asyncio.Task
        self.tasks: Dict[str, asyncio.Task] = {}

        # Client tracking: client_id -> set of thread_ids
        self.client_threads: Dict[str, Set[str]] = {}

        # Thread callbacks: thread_id -> callbacks dict
        self.callbacks: Dict[str, Dict[str, Callable]] = {}

        # Thread tools: thread_id -> list of tools
        self.tools: Dict[str, List] = {}

    # ─────────────────────────────────────────────────────────────────────────
    # Thread Operations
    # ─────────────────────────────────────────────────────────────────────────

    def add_thread(self, thread: Thread) -> None:
        """Add a thread to storage."""
        self.threads[thread.id] = thread

        # Track client ownership
        if thread.client_id:
            if thread.client_id not in self.client_threads:
                self.client_threads[thread.client_id] = set()
            self.client_threads[thread.client_id].add(thread.id)

    def get_thread(self, thread_id: str) -> Optional[Thread]:
        """Get a thread by ID."""
        return self.threads.get(thread_id)

    def list_threads(self, client_id: str = None) -> List[Thread]:
        """
        List all threads, optionally filtered by client.

        Args:
            client_id: Filter to threads owned by this client

        Returns:
            List of Thread objects
        """
        if client_id and client_id in self.client_threads:
            return [
                self.threads[tid]
                for tid in self.client_threads[client_id]
                if tid in self.threads
            ]
        return list(self.threads.values())

    def remove_thread(self, thread_id: str) -> Optional[Thread]:
        """
        Remove a thread from storage.

        Returns:
            The removed thread, or None if not found
        """
        thread = self.threads.pop(thread_id, None)

        if thread and thread.client_id and thread.client_id in self.client_threads:
            self.client_threads[thread.client_id].discard(thread_id)

        return thread

    # ─────────────────────────────────────────────────────────────────────────
    # Executor Operations
    # ─────────────────────────────────────────────────────────────────────────

    def set_executor(self, thread_id: str, executor: AgentExecutor) -> None:
        """Store executor for a thread."""
        self.executors[thread_id] = executor

    def get_executor(self, thread_id: str) -> Optional[AgentExecutor]:
        """Get executor for a thread."""
        return self.executors.get(thread_id)

    def remove_executor(self, thread_id: str) -> Optional[AgentExecutor]:
        """Remove and return executor for a thread."""
        return self.executors.pop(thread_id, None)

    # ─────────────────────────────────────────────────────────────────────────
    # Task Operations
    # ─────────────────────────────────────────────────────────────────────────

    def set_task(self, thread_id: str, task: asyncio.Task) -> None:
        """Store background task for a thread."""
        self.tasks[thread_id] = task

    def get_task(self, thread_id: str) -> Optional[asyncio.Task]:
        """Get background task for a thread."""
        return self.tasks.get(thread_id)

    def cancel_task(self, thread_id: str) -> None:
        """Cancel and remove background task for a thread."""
        task = self.tasks.pop(thread_id, None)
        if task:
            task.cancel()

    # ─────────────────────────────────────────────────────────────────────────
    # Callbacks Operations
    # ─────────────────────────────────────────────────────────────────────────

    def set_callbacks(self, thread_id: str, callbacks: Dict[str, Callable]) -> None:
        """Store callbacks for a thread."""
        self.callbacks[thread_id] = callbacks

    def get_callbacks(self, thread_id: str) -> Dict[str, Callable]:
        """Get callbacks for a thread (returns empty dict if not found)."""
        return self.callbacks.get(thread_id, {})

    def remove_callbacks(self, thread_id: str) -> None:
        """Remove callbacks for a thread."""
        self.callbacks.pop(thread_id, None)

    # ─────────────────────────────────────────────────────────────────────────
    # Tools Operations
    # ─────────────────────────────────────────────────────────────────────────

    def set_tools(self, thread_id: str, tools: List) -> None:
        """Store tools for a thread."""
        self.tools[thread_id] = tools

    def get_tools(self, thread_id: str) -> Optional[List]:
        """Get tools for a thread."""
        return self.tools.get(thread_id)

    def remove_tools(self, thread_id: str) -> None:
        """Remove tools for a thread."""
        self.tools.pop(thread_id, None)

    # ─────────────────────────────────────────────────────────────────────────
    # Cleanup Operations
    # ─────────────────────────────────────────────────────────────────────────

    def cleanup_thread(self, thread_id: str) -> None:
        """
        Full cleanup of all state for a thread.

        Cancels task, removes executor, callbacks, tools, and thread.
        """
        self.cancel_task(thread_id)
        self.remove_executor(thread_id)
        self.remove_callbacks(thread_id)
        self.remove_tools(thread_id)
        self.remove_thread(thread_id)

    def cleanup_client(self, client_id: str, keep_review: bool = True) -> List[str]:
        """
        Cleanup all threads for a disconnected client.

        Args:
            client_id: Client to cleanup
            keep_review: If True, threads in REVIEW status are kept

        Returns:
            List of thread_ids that were cleaned up
        """
        if client_id not in self.client_threads:
            return []

        cleaned = []
        for thread_id in list(self.client_threads[client_id]):
            thread = self.threads.get(thread_id)
            if thread:
                if keep_review and thread.status == ThreadStatus.REVIEW:
                    continue
                self.cleanup_thread(thread_id)
                cleaned.append(thread_id)

        # Remove client tracking if empty
        if client_id in self.client_threads and not self.client_threads[client_id]:
            del self.client_threads[client_id]

        return cleaned
