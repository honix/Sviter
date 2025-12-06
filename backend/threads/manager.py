"""
Thread manager for wiki agents.

Manages thread lifecycle:
- Create threads with git branches
- Start/stop thread execution
- Handle accept/reject workflow
- Track threads per client
"""

import asyncio
from typing import Dict, List, Optional, Set, Callable, Any, Awaitable, Union
from datetime import datetime

from storage.git_wiki import GitWiki
from agents.unified_executor import UnifiedAgentExecutor
from agents.config import GlobalAgentConfig
from .models import Thread, ThreadStatus, ThreadMessage, AcceptResult


class ThreadManager:
    """
    In-memory thread storage and lifecycle management.

    Each client can have multiple threads running concurrently.
    Threads are lost on server restart (by design - MVP simplicity).
    """

    def __init__(self, wiki: GitWiki, api_key: str = None):
        """
        Initialize thread manager.

        Args:
            wiki: GitWiki instance for branch operations
            api_key: OpenRouter API key
        """
        self.wiki = wiki
        self.api_key = api_key

        # Thread storage: thread_id -> Thread
        self.threads: Dict[str, Thread] = {}

        # Executor storage: thread_id -> UnifiedAgentExecutor
        self.executors: Dict[str, UnifiedAgentExecutor] = {}

        # Background tasks: thread_id -> asyncio.Task
        self.tasks: Dict[str, asyncio.Task] = {}

        # Client tracking: client_id -> set of thread_ids
        self.client_threads: Dict[str, Set[str]] = {}

        # Thread callbacks: thread_id -> callbacks dict
        self.thread_callbacks: Dict[str, Dict[str, Callable]] = {}

        # Thread tools: thread_id -> list of tools (stored for resuming)
        self.thread_tools: Dict[str, List] = {}

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

    def get_thread(self, thread_id: str) -> Optional[Thread]:
        """Get a thread by ID."""
        return self.threads.get(thread_id)

    def create_thread(self, name: str, goal: str, client_id: str) -> Thread:
        """
        Create a new thread with its git branch.

        Args:
            name: Human-readable thread name
            goal: What the thread should accomplish
            client_id: Client that owns this thread

        Returns:
            Created Thread object
        """
        # Create thread object
        thread = Thread.create(name, goal, client_id)

        # Pull latest main before creating branch
        # Store original branch to restore after operation
        original_branch = None
        try:
            original_branch = self.wiki.get_current_branch()
            if original_branch != "main":
                self.wiki.checkout_branch("main")

            # Pull latest from remote
            try:
                self.wiki.git_repo.remotes.origin.pull("main")
                print(f"✅ Pulled latest main for thread {thread.name}")
            except Exception as pull_error:
                print(f"⚠️ Could not pull main (might be local-only): {pull_error}")
        except Exception as e:
            print(f"⚠️ Error preparing main for thread: {e}")
        finally:
            # Restore original branch if we switched away from it
            if original_branch and original_branch != "main":
                try:
                    self.wiki.checkout_branch(original_branch)
                except Exception as restore_error:
                    print(f"⚠️ Could not restore branch {original_branch}: {restore_error}")

        # Create git branch (don't checkout - stay on main)
        try:
            self.wiki.create_branch(
                thread.branch,
                from_branch="main",
                checkout=False
            )
        except Exception as e:
            # Branch might already exist or other error
            thread.set_error(f"Failed to create branch: {e}")

        # Store thread
        self.threads[thread.id] = thread

        # Track client ownership
        if client_id not in self.client_threads:
            self.client_threads[client_id] = set()
        self.client_threads[client_id].add(thread.id)

        return thread

    async def start_thread(
        self,
        thread_id: str,
        on_message: Union[Callable[[str, str], None], Callable[[str, str], Awaitable[None]]] = None,
        on_tool_call: Union[Callable[[Dict], None], Callable[[Dict], Awaitable[None]]] = None,
        on_status_change: Union[Callable[[str, str, str], None], Callable[[str, str, str], Awaitable[None]]] = None,
    ) -> bool:
        """
        Start thread execution in background.

        The thread will run autonomously until it:
        - Calls mark_for_review (status -> REVIEW)
        - Calls request_help (status -> NEED_HELP)
        - Encounters an error

        Args:
            thread_id: Thread to start
            on_message: Callback for messages (thread_id, type, content)
            on_tool_call: Callback for tool calls
            on_status_change: Callback for status changes (thread_id, status, message)

        Returns:
            True if started successfully
        """
        thread = self.threads.get(thread_id)
        if not thread:
            return False

        # Store callbacks
        self.thread_callbacks[thread_id] = {
            "on_message": on_message,
            "on_tool_call": on_tool_call,
            "on_status_change": on_status_change
        }

        # Create executor
        executor = UnifiedAgentExecutor(wiki=self.wiki, api_key=self.api_key)
        self.executors[thread_id] = executor

        # Checkout thread's branch
        try:
            self.wiki.checkout_branch(thread.branch)
        except Exception as e:
            thread.set_error(f"Failed to checkout branch: {e}")
            return False

        # Start execution task
        task = asyncio.create_task(
            self._run_thread(thread_id)
        )
        self.tasks[thread_id] = task

        return True

    async def _run_thread(self, thread_id: str):
        """
        Main thread execution loop.

        Runs the ThreadAgent until it stops or changes status.
        """
        thread = self.threads.get(thread_id)
        if not thread:
            return

        executor = self.executors.get(thread_id)
        if not executor:
            return

        callbacks = self.thread_callbacks.get(thread_id, {})

        try:
            # Import here to avoid circular imports
            from .thread_agent import ThreadAgent, get_thread_tools

            # Ensure we're on the thread's branch
            self.wiki.checkout_branch(thread.branch)

            # Create status change callbacks for tools
            def on_request_help(question: str):
                thread.set_status(ThreadStatus.NEED_HELP)
                thread.add_message("system", f"Requesting help: {question}")
                asyncio.create_task(
                    self._call_callback(
                        callbacks.get("on_status_change"),
                        thread_id, "need_help", question
                    )
                )

            def on_mark_for_review(summary: str):
                thread.set_status(ThreadStatus.REVIEW, summary)
                thread.add_message("system", f"Marked for review: {summary}")
                asyncio.create_task(
                    self._call_callback(
                        callbacks.get("on_status_change"),
                        thread_id, "review", summary
                    )
                )

            # Get thread tools with callbacks
            thread_tools = get_thread_tools(
                self.wiki,
                on_request_help,
                on_mark_for_review
            )
            # Store tools for use in send_to_thread
            self.thread_tools[thread_id] = thread_tools

            # Build system prompt with goal
            system_prompt = self._build_thread_prompt(thread)

            # Wrap callbacks to add messages to thread conversation
            async def message_callback(msg_type: str, content: str):
                if msg_type == "assistant":
                    thread.add_message("assistant", content)
                await self._call_callback(callbacks.get("on_message"), msg_type, content)

            async def tool_call_callback(tool_info: Dict[str, Any]):
                thread.add_message(
                    "tool_call",
                    tool_info.get("result", ""),
                    tool_name=tool_info.get("tool_name"),
                    tool_args=tool_info.get("arguments"),
                    tool_result=tool_info.get("result")
                )
                await self._call_callback(callbacks.get("on_tool_call"), tool_info)

            # Start session with ThreadAgent
            await executor.start_session(
                agent_class=ThreadAgent,
                system_prompt=system_prompt,
                on_message=message_callback,
                on_tool_call=tool_call_callback,
            )

            # Initial turn with goal - pass custom thread tools
            initial_message = f"Your goal: {thread.goal}\n\nBegin working on this task."
            thread.add_message("user", initial_message)

            result = await executor.process_turn(initial_message, custom_tools=thread_tools)

            # Continue until status changes or error
            while thread.status == ThreadStatus.WORKING:
                if result.status in ['completed', 'stopped']:
                    # Agent naturally completed
                    if thread.status == ThreadStatus.WORKING:
                        # Didn't call mark_for_review, do it automatically
                        thread.set_status(ThreadStatus.REVIEW, "Task completed")
                        await self._call_callback(
                            callbacks.get("on_status_change"),
                            thread_id, "review", "Task completed"
                        )
                    break
                elif result.status == 'error':
                    thread.set_error(result.error)
                    thread.set_status(ThreadStatus.NEED_HELP)
                    await self._call_callback(
                        callbacks.get("on_status_change"),
                        thread_id, "need_help", f"Error: {result.error}"
                    )
                    break

                # Wait a bit before checking again (shouldn't normally reach here)
                await asyncio.sleep(0.1)

        except asyncio.CancelledError:
            # Task was cancelled (e.g., client disconnect)
            pass
        except Exception as e:
            thread.set_error(str(e))
            thread.set_status(ThreadStatus.NEED_HELP)
            await self._call_callback(
                callbacks.get("on_status_change"),
                thread_id, "need_help", f"Error: {e}"
            )

        finally:
            thread.updated_at = datetime.now()
            # Return to main branch
            try:
                self.wiki.checkout_branch("main")
            except Exception:
                pass

    def _build_thread_prompt(self, thread: Thread) -> str:
        """Build system prompt for thread agent."""
        return f"""You are a wiki editing agent working on a specific task.

Your assigned task: {thread.goal}

You are working on branch: {thread.branch}

You have tools to:
- read_page(title): Read wiki page content
- edit_page(title, content): Create or edit wiki pages
- find_pages(query): Search for pages
- list_all_pages(): List all pages
- request_help(question): Ask the user for help when stuck
- mark_for_review(summary): Mark your changes as ready for review

Guidelines:
1. Make focused changes related to your goal
2. If you're unsure about something, use request_help()
3. When you've completed your task, use mark_for_review()
4. Be thorough but don't over-edit

Begin working on your task."""

    async def send_to_thread(self, thread_id: str, message: str) -> bool:
        """
        Send user message to thread.

        If thread is in NEED_HELP status, this resumes execution.

        Args:
            thread_id: Thread to send to
            message: User's message

        Returns:
            True if message was sent
        """
        thread = self.threads.get(thread_id)
        if not thread:
            return False

        # Add message to conversation
        thread.add_message("user", message)

        executor = self.executors.get(thread_id)
        if not executor:
            return False

        # Get stored thread tools
        thread_tools = self.thread_tools.get(thread_id)

        # If thread was waiting for help, resume
        if thread.status == ThreadStatus.NEED_HELP:
            thread.set_status(ThreadStatus.WORKING)

            callbacks = self.thread_callbacks.get(thread_id, {})
            await self._call_callback(
                callbacks.get("on_status_change"),
                thread_id, "working", "Resuming work"
            )

            # Ensure we're on thread's branch
            self.wiki.checkout_branch(thread.branch)

            # Process the message with thread tools
            result = await executor.process_turn(message, custom_tools=thread_tools)

            # Handle result (may change status again)
            if result.status == 'error':
                thread.set_error(result.error)
                thread.set_status(ThreadStatus.NEED_HELP)
                await self._call_callback(
                    callbacks.get("on_status_change"),
                    thread_id, "need_help", f"Error: {result.error}"
                )

            # Return to main
            self.wiki.checkout_branch("main")

        elif thread.status == ThreadStatus.REVIEW:
            # User wants to make changes before accepting
            thread.set_status(ThreadStatus.WORKING)

            callbacks = self.thread_callbacks.get(thread_id, {})
            await self._call_callback(
                callbacks.get("on_status_change"),
                thread_id, "working", "Processing feedback"
            )

            # Ensure we're on thread's branch
            self.wiki.checkout_branch(thread.branch)

            # Process the message with thread tools
            result = await executor.process_turn(message, custom_tools=thread_tools)

            # Return to main
            self.wiki.checkout_branch("main")

        return True

    async def accept_thread(self, thread_id: str) -> AcceptResult:
        """
        Accept thread changes - merge to main.

        If there are conflicts, returns CONFLICT and the agent
        will be asked to resolve them.

        Args:
            thread_id: Thread to accept

        Returns:
            AcceptResult indicating success, conflict, or error
        """
        thread = self.threads.get(thread_id)
        if not thread:
            return AcceptResult.ERROR

        if thread.status != ThreadStatus.REVIEW:
            return AcceptResult.ERROR

        try:
            # Checkout main
            self.wiki.checkout_branch("main")

            # Try to merge thread branch
            try:
                self.wiki.merge_branch(thread.branch, "main")

                # Success - delete branch and cleanup
                self.wiki.delete_branch(thread.branch, force=True)
                self._cleanup_thread(thread_id)

                return AcceptResult.SUCCESS

            except Exception as merge_error:
                if "conflict" in str(merge_error).lower():
                    # Conflict - abort merge and let agent resolve
                    try:
                        self.wiki.git_repo.git.merge("--abort")
                    except Exception:
                        pass

                    # Start conflict resolution
                    await self._resolve_conflicts(thread_id)
                    return AcceptResult.CONFLICT
                else:
                    thread.set_error(f"Merge failed: {merge_error}")
                    return AcceptResult.ERROR

        except Exception as e:
            thread.set_error(f"Accept failed: {e}")
            return AcceptResult.ERROR

    async def _resolve_conflicts(self, thread_id: str):
        """
        Auto-resolve merge conflicts by having agent merge main into its branch.
        """
        thread = self.threads.get(thread_id)
        if not thread:
            return

        executor = self.executors.get(thread_id)
        if not executor:
            return

        callbacks = self.thread_callbacks.get(thread_id, {})

        # Update status
        thread.set_status(ThreadStatus.WORKING)
        await self._call_callback(
            callbacks.get("on_status_change"),
            thread_id, "working", "Resolving merge conflicts"
        )

        try:
            # Checkout thread branch
            self.wiki.checkout_branch(thread.branch)

            # Merge main into thread branch
            try:
                self.wiki.merge_branch("main", thread.branch)
            except Exception as e:
                # There are conflicts - let agent see them
                pass

            # Get stored thread tools
            thread_tools = self.thread_tools.get(thread_id)

            # Ask agent to resolve
            resolve_message = """
There are merge conflicts with the main branch. Please:
1. Review the conflicted files
2. Resolve the conflicts by editing the files
3. When done, call mark_for_review() again

The user will review your resolution.
"""
            thread.add_message("user", resolve_message)
            result = await executor.process_turn(resolve_message, custom_tools=thread_tools)

            # Return to main
            self.wiki.checkout_branch("main")

        except Exception as e:
            thread.set_error(f"Conflict resolution failed: {e}")
            thread.set_status(ThreadStatus.NEED_HELP)
            await self._call_callback(
                callbacks.get("on_status_change"),
                thread_id, "need_help", f"Conflict resolution error: {e}"
            )

    async def reject_thread(self, thread_id: str) -> bool:
        """
        Reject thread changes - delete branch without merging.

        Args:
            thread_id: Thread to reject

        Returns:
            True if rejected successfully
        """
        thread = self.threads.get(thread_id)
        if not thread:
            return False

        try:
            # Ensure we're on main
            self.wiki.checkout_branch("main")

            # Delete the branch
            self.wiki.delete_branch(thread.branch, force=True)

            # Cleanup
            self._cleanup_thread(thread_id)

            return True

        except Exception:
            # Still cleanup even if branch delete fails
            self._cleanup_thread(thread_id)
            return True

    def _cleanup_thread(self, thread_id: str):
        """Remove thread from memory."""
        # Cancel task if running
        if thread_id in self.tasks:
            self.tasks[thread_id].cancel()
            del self.tasks[thread_id]

        # Remove executor
        if thread_id in self.executors:
            del self.executors[thread_id]

        # Remove callbacks
        if thread_id in self.thread_callbacks:
            del self.thread_callbacks[thread_id]

        # Remove tools
        if thread_id in self.thread_tools:
            del self.thread_tools[thread_id]

        # Remove thread
        if thread_id in self.threads:
            thread = self.threads[thread_id]
            del self.threads[thread_id]

            # Remove from client tracking
            if thread.client_id and thread.client_id in self.client_threads:
                self.client_threads[thread.client_id].discard(thread_id)

    def cleanup_client(self, client_id: str):
        """
        Cleanup all threads for a disconnected client.

        Note: Threads in REVIEW status are kept (user might reconnect).
        """
        if client_id not in self.client_threads:
            return

        for thread_id in list(self.client_threads[client_id]):
            thread = self.threads.get(thread_id)
            if thread and thread.status != ThreadStatus.REVIEW:
                # Only cleanup non-review threads
                self._cleanup_thread(thread_id)

        # Remove client tracking
        if client_id in self.client_threads:
            del self.client_threads[client_id]

    def get_thread_diff_stats(self, thread_id: str) -> Optional[Dict[str, Any]]:
        """
        Get diff statistics for a thread.

        Returns:
            Dict with files_changed, lines_added, lines_removed, files list
        """
        thread = self.threads.get(thread_id)
        if not thread:
            return None

        try:
            return self.wiki.get_diff_stat("main", thread.branch)
        except Exception:
            return None

    async def _call_callback(self, callback: Optional[Callable], *args, **kwargs):
        """Helper to call sync or async callbacks."""
        if callback is None:
            return
        if asyncio.iscoroutinefunction(callback):
            await callback(*args, **kwargs)
        else:
            callback(*args, **kwargs)
