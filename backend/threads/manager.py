"""
Thread manager for wiki agents.

Thin orchestrator that delegates to:
- git_operations: Branch management
- state: Thread storage
- ToolBuilder: Tool creation
"""

import asyncio
from typing import Dict, List, Optional, Callable, Any, Awaitable, Union
from datetime import datetime

from storage.git_wiki import GitWiki
from agents.executor import AgentExecutor
from ai.tools import ToolBuilder

from .models import Thread, ThreadStatus, AcceptResult
from .state import ThreadState
from .prompts import THREAD_PROMPT
from . import git_operations as git_ops


class ThreadManager:
    """
    Thread lifecycle orchestrator.

    Manages thread creation, execution, and accept/reject workflow.
    """

    def __init__(self, wiki: GitWiki, api_key: str = None):
        self.wiki = wiki
        self.api_key = api_key
        self.state = ThreadState()

    # ─────────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────────

    def list_threads(self, client_id: str = None) -> List[Thread]:
        """List all threads, optionally filtered by client."""
        return self.state.list_threads(client_id)

    def get_thread(self, thread_id: str) -> Optional[Thread]:
        """Get a thread by ID."""
        return self.state.get_thread(thread_id)

    def create_thread(self, name: str, goal: str, client_id: str) -> Thread:
        """Create a new thread with its git branch."""
        thread = Thread.create(name, goal, client_id)

        # Create git branch
        error = git_ops.prepare_branch(self.wiki, thread.branch)
        if error:
            thread.set_error(error)

        self.state.add_thread(thread)
        return thread

    async def start_thread(
        self,
        thread_id: str,
        on_message: Union[Callable, Awaitable] = None,
        on_tool_call: Union[Callable, Awaitable] = None,
        on_status_change: Union[Callable, Awaitable] = None,
    ) -> bool:
        """Start thread execution in background."""
        thread = self.state.get_thread(thread_id)
        if not thread:
            return False

        # Store callbacks
        self.state.set_callbacks(thread_id, {
            "on_message": on_message,
            "on_tool_call": on_tool_call,
            "on_status_change": on_status_change
        })

        # Create executor
        executor = AgentExecutor(wiki=self.wiki, api_key=self.api_key)
        self.state.set_executor(thread_id, executor)

        # Checkout thread's branch
        error = git_ops.checkout_thread(self.wiki, thread.branch)
        if error:
            thread.set_error(error)
            return False

        # Start execution task
        task = asyncio.create_task(self._run_thread(thread_id))
        self.state.set_task(thread_id, task)

        return True

    async def send_to_thread(self, thread_id: str, message: str) -> bool:
        """Send user message to thread."""
        thread = self.state.get_thread(thread_id)
        if not thread:
            return False

        thread.add_message("user", message)

        executor = self.state.get_executor(thread_id)
        if not executor:
            return False

        tools = self.state.get_tools(thread_id)
        callbacks = self.state.get_callbacks(thread_id)

        # Resume if waiting
        if thread.status in (ThreadStatus.NEED_HELP, ThreadStatus.REVIEW):
            thread.set_status(ThreadStatus.WORKING)
            await self._call_callback(
                callbacks.get("on_status_change"),
                thread_id, "working", "Resuming work"
            )

            git_ops.checkout_thread(self.wiki, thread.branch)
            result = await executor.process_turn(message, custom_tools=tools)

            if result.status == 'error':
                thread.set_error(result.error)
                thread.set_status(ThreadStatus.NEED_HELP)
                await self._call_callback(
                    callbacks.get("on_status_change"),
                    thread_id, "need_help", f"Error: {result.error}"
                )

            git_ops.return_to_main(self.wiki)

        return True

    async def accept_thread(self, thread_id: str) -> AcceptResult:
        """Accept thread changes - merge to main."""
        thread = self.state.get_thread(thread_id)
        if not thread or thread.status != ThreadStatus.REVIEW:
            return AcceptResult.ERROR

        result = git_ops.merge_thread(self.wiki, thread.branch)

        if result["success"]:
            git_ops.delete_thread_branch(self.wiki, thread.branch)
            self._cleanup_thread(thread_id)
            return AcceptResult.SUCCESS

        if result["conflict"]:
            await self._resolve_conflicts(thread_id)
            return AcceptResult.CONFLICT

        thread.set_error(f"Merge failed: {result['error']}")
        return AcceptResult.ERROR

    async def reject_thread(self, thread_id: str) -> bool:
        """Reject thread changes - delete branch without merging."""
        thread = self.state.get_thread(thread_id)
        if not thread:
            return False

        git_ops.delete_thread_branch(self.wiki, thread.branch)
        self._cleanup_thread(thread_id)
        return True

    def get_thread_diff_stats(self, thread_id: str) -> Optional[Dict[str, Any]]:
        """Get diff statistics for a thread."""
        thread = self.state.get_thread(thread_id)
        if not thread:
            return None
        return git_ops.get_diff_stats(self.wiki, thread.branch)

    def cleanup_client(self, client_id: str):
        """Cleanup all threads for a disconnected client."""
        self.state.cleanup_client(client_id, keep_review=True)

    def _cleanup_thread(self, thread_id: str):
        """Remove thread from memory."""
        self.state.cleanup_thread(thread_id)

    # ─────────────────────────────────────────────────────────────────────────
    # Internal
    # ─────────────────────────────────────────────────────────────────────────

    async def _run_thread(self, thread_id: str):
        """Main thread execution loop."""
        thread = self.state.get_thread(thread_id)
        executor = self.state.get_executor(thread_id)
        callbacks = self.state.get_callbacks(thread_id)

        if not thread or not executor:
            return

        try:
            git_ops.checkout_thread(self.wiki, thread.branch)

            # Create tool callbacks
            def on_request_help(question: str):
                thread.set_status(ThreadStatus.NEED_HELP)
                thread.add_message("system", f"Requesting help: {question}")
                asyncio.create_task(self._call_callback(
                    callbacks.get("on_status_change"),
                    thread_id, "need_help", question
                ))

            def on_mark_for_review(summary: str):
                thread.set_status(ThreadStatus.REVIEW, summary)
                thread.add_message("system", f"Marked for review: {summary}")
                asyncio.create_task(self._call_callback(
                    callbacks.get("on_status_change"),
                    thread_id, "review", summary
                ))

            # Get tools using ToolBuilder
            tools = ToolBuilder.for_thread(
                self.wiki,
                on_request_help,
                on_mark_for_review
            )
            self.state.set_tools(thread_id, tools)

            # Build prompt
            prompt = THREAD_PROMPT.format(goal=thread.goal, branch=thread.branch)

            # Wrap callbacks
            async def message_cb(msg_type: str, content: str):
                if msg_type == "assistant":
                    thread.add_message("assistant", content)
                await self._call_callback(callbacks.get("on_message"), msg_type, content)

            async def tool_cb(tool_info: Dict[str, Any]):
                thread.add_message(
                    "tool_call", tool_info.get("result", ""),
                    tool_name=tool_info.get("tool_name"),
                    tool_args=tool_info.get("arguments"),
                    tool_result=tool_info.get("result")
                )
                await self._call_callback(callbacks.get("on_tool_call"), tool_info)

            # Start session
            await executor.start_session(
                system_prompt=prompt,
                on_message=message_cb,
                on_tool_call=tool_cb,
            )

            # Initial turn
            initial = f"Your goal: {thread.goal}\n\nBegin working on this task."
            thread.add_message("user", initial)
            result = await executor.process_turn(initial, custom_tools=tools)

            # Continue until status changes
            while thread.status == ThreadStatus.WORKING:
                if result.status in ['completed', 'stopped']:
                    if thread.status == ThreadStatus.WORKING:
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

                await asyncio.sleep(0.1)

        except asyncio.CancelledError:
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
            git_ops.return_to_main(self.wiki)

    async def _resolve_conflicts(self, thread_id: str):
        """Auto-resolve merge conflicts by having agent merge main into its branch."""
        thread = self.state.get_thread(thread_id)
        executor = self.state.get_executor(thread_id)
        callbacks = self.state.get_callbacks(thread_id)

        if not thread or not executor:
            return

        thread.set_status(ThreadStatus.WORKING)
        await self._call_callback(
            callbacks.get("on_status_change"),
            thread_id, "working", "Resolving merge conflicts"
        )

        try:
            git_ops.merge_main_into_thread(self.wiki, thread.branch)
            tools = self.state.get_tools(thread_id)

            resolve_msg = """
There are merge conflicts with the main branch. Please:
1. Review the conflicted files
2. Resolve the conflicts by editing the files
3. When done, call mark_for_review() again

The user will review your resolution.
"""
            thread.add_message("user", resolve_msg)
            await executor.process_turn(resolve_msg, custom_tools=tools)
            git_ops.return_to_main(self.wiki)

        except Exception as e:
            thread.set_error(f"Conflict resolution failed: {e}")
            thread.set_status(ThreadStatus.NEED_HELP)
            await self._call_callback(
                callbacks.get("on_status_change"),
                thread_id, "need_help", f"Conflict resolution error: {e}"
            )

    async def _call_callback(self, callback: Optional[Callable], *args, **kwargs):
        """Helper to call sync or async callbacks."""
        if callback is None:
            return
        if asyncio.iscoroutinefunction(callback):
            await callback(*args, **kwargs)
        else:
            callback(*args, **kwargs)
