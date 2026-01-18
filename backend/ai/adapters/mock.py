"""
Mock adapter for E2E testing.

Returns scripted responses without making API calls.
Supports deterministic test scenarios for CI/CD pipelines.
"""

import json
import re
from typing import Dict, List, Any, Optional, Callable, Awaitable, TYPE_CHECKING

from .base import LLMAdapter, CompletionResult, ConversationResult, ToolCall


def parse_user_context(message: str) -> tuple[str, List[Dict[str, str]]]:
    """
    Parse user-provided context from a message.

    Returns (clean_message, contexts) where contexts is a list of:
    - {'id': '#1', 'source': 'path/to/file.md', 'content': '...'}
    """
    # Pattern to find the context XML block at the end of message
    context_pattern = r'<userProvidedContext>([\s\S]*?)</userProvidedContext>\s*$'
    match = re.search(context_pattern, message)

    if not match:
        return message, []

    # Remove context block from message
    clean_message = re.sub(context_pattern, '', message).strip()

    # Parse individual context items
    contexts = []
    context_block = match.group(1)
    item_pattern = r'<contextItem\s+id="([^"]+)"(?:\s+source="([^"]*)")?>([\s\S]*?)</contextItem>'

    for item_match in re.finditer(item_pattern, context_block):
        contexts.append({
            'id': item_match.group(1),
            'source': item_match.group(2) or '',
            'content': item_match.group(3).strip()
        })

    return clean_message, contexts

if TYPE_CHECKING:
    from ai.tools import WikiTool


class MockAdapter(LLMAdapter):
    """
    Mock LLM adapter for testing.

    Returns scripted responses based on conversation context.
    No actual API calls are made.

    Test scenarios:
    1. Assistant thread: Spawns a worker thread when asked to make changes
    2. Worker thread: Reads page, edits it, marks for review
    """

    # Track conversation turns per session to determine which response to give
    _turn_counters: Dict[str, int] = {}
    _instance_id: int = 0

    def __init__(self, system_prompt: str = "", model: str = "mock"):
        """Initialize mock adapter."""
        MockAdapter._instance_id += 1
        self._id = MockAdapter._instance_id
        self.system_prompt = system_prompt
        self.model = model
        # Determine thread type from system prompt
        self._is_worker = "wiki editing thread" in system_prompt.lower() or "working on branch" in system_prompt.lower()
        # Reset turn counter for this instance
        self._turn_key = f"mock_{self._id}"
        MockAdapter._turn_counters[self._turn_key] = 0

    def _get_turn(self) -> int:
        """Get current turn number and increment."""
        turn = MockAdapter._turn_counters.get(self._turn_key, 0)
        MockAdapter._turn_counters[self._turn_key] = turn + 1
        return turn

    def create_completion(
        self,
        messages: List[Dict[str, Any]],
        tools: List['WikiTool'],
        system_prompt: str
    ) -> CompletionResult:
        """Not used directly - process_conversation handles everything."""
        raise NotImplementedError("Use process_conversation instead")

    def format_tool_result(self, tool_call_id: str, result: str) -> Dict[str, Any]:
        """Format tool result for OpenAI message format."""
        return {
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": result
        }

    def format_assistant_message(self, result: CompletionResult) -> Dict[str, Any]:
        """Format assistant message for conversation history."""
        return {"role": "assistant", "content": result.content}

    async def process_conversation(
        self,
        user_message: str,
        conversation_history: List[Dict[str, Any]],
        tools: List['WikiTool'],
        max_turns: int = 20,
        on_message: Optional[Callable[[str, str], Awaitable[None]]] = None,
        on_tool_call: Optional[Callable[[Dict], Awaitable[None]]] = None,
    ) -> ConversationResult:
        """
        Process conversation with scripted mock responses.

        For assistant threads: Spawns worker thread on edit requests
        For worker threads: Reads, edits, and marks for review
        """
        turn = self._get_turn()
        tool_names = [t.name for t in tools]

        # Check if this is a worker thread (has edit tools)
        has_edit_tools = "edit_page" in tool_names
        has_spawn = "spawn_thread" in tool_names

        if has_spawn and not has_edit_tools:
            # This is a main assistant thread
            return await self._handle_assistant_turn(
                user_message, tools, turn, on_message, on_tool_call
            )
        elif has_edit_tools:
            # This is a worker thread
            return await self._handle_worker_turn(
                user_message, tools, turn, on_message, on_tool_call
            )
        else:
            # Unknown context, return simple response
            content = "I understand your request. How can I help you further?"
            if on_message:
                await on_message("assistant", content)
            return ConversationResult(
                status='completed',
                stop_reason='natural_completion',
                iterations=1,
                final_response=content
            )

    async def _handle_assistant_turn(
        self,
        user_message: str,
        tools: List['WikiTool'],
        turn: int,
        on_message: Optional[Callable],
        on_tool_call: Optional[Callable]
    ) -> ConversationResult:
        """Handle assistant thread conversation."""
        # Parse any user-provided context from the message
        clean_message, contexts = parse_user_context(user_message)
        user_lower = clean_message.lower()

        # If user provided context, acknowledge it
        if contexts:
            context_count = len(contexts)
            sources = [c['source'] for c in contexts if c['source']]
            source_list = ', '.join(sources) if sources else 'selected text'

            content = f"I see you provided {context_count} context{'s' if context_count > 1 else ''} from: {source_list}. "

            # Provide a response based on the context content
            if any('path:' in c['content'] for c in contexts):
                # File path reference
                content += "I can see the file reference you've shared. "
            else:
                # Text selection
                first_content_preview = contexts[0]['content'][:50] + '...' if len(contexts[0]['content']) > 50 else contexts[0]['content']
                content += f"The content starts with: \"{first_content_preview}\". "

            content += "How would you like me to help with this?"

            if on_message:
                await on_message("assistant", content)

            return ConversationResult(
                status='completed',
                stop_reason='natural_completion',
                iterations=1,
                final_response=content
            )

        # Check if user is asking to edit/change/update something
        edit_keywords = ["edit", "change", "update", "modify", "add", "remove", "fix", "improve"]
        wants_edit = any(kw in user_lower for kw in edit_keywords)

        if wants_edit and turn == 0:
            # First turn with edit request - spawn a worker thread
            content = "I'll create a worker thread to handle that change for you."
            if on_message:
                await on_message("assistant", content)

            # Find spawn_thread tool and execute it
            spawn_tool = next((t for t in tools if t.name == "spawn_thread"), None)
            if spawn_tool:
                # Extract what page/content to edit from the message
                tool_args = {
                    "name": "e2e-test-edit",
                    "goal": f"Edit wiki content as requested: {user_message[:100]}"
                }
                result = spawn_tool.function(tool_args)

                if on_tool_call:
                    await on_tool_call({
                        "tool_name": "spawn_thread",
                        "arguments": tool_args,
                        "result": result,
                        "iteration": 1
                    })

                final_content = f"{content}\n\nThread created! It will work on your request and notify you when ready for review."
                return ConversationResult(
                    status='completed',
                    stop_reason='natural_completion',
                    iterations=1,
                    final_response=final_content
                )

        # Default response for assistant
        content = "I can help you with wiki pages. What would you like me to do?"
        if on_message:
            await on_message("assistant", content)

        return ConversationResult(
            status='completed',
            stop_reason='natural_completion',
            iterations=1,
            final_response=content
        )

    async def _handle_worker_turn(
        self,
        user_message: str,
        tools: List['WikiTool'],
        turn: int,
        on_message: Optional[Callable],
        on_tool_call: Optional[Callable]
    ) -> ConversationResult:
        """
        Handle worker thread conversation.

        Turn 0: Read TestPage, then edit it, then mark for review
        """
        iteration = 0
        tool_names = [t.name for t in tools]
        print(f"🤖 MockAdapter._handle_worker_turn: turn={turn}, tools={tool_names}")

        if turn == 0:
            # First turn - worker starts its task
            # Step 1: Read the page first
            content = "I'll start by reading the TestPage to understand its current content."
            if on_message:
                await on_message("assistant", content)

            read_tool = next((t for t in tools if t.name == "read_page"), None)
            if read_tool:
                iteration += 1
                read_args = {"path": "TestPage.md"}
                print(f"🤖 MockAdapter: Calling read_page with {read_args}")
                read_result = read_tool.function(read_args)
                print(f"🤖 MockAdapter: read_page result length: {len(read_result)}")

                if on_tool_call:
                    await on_tool_call({
                        "tool_name": "read_page",
                        "arguments": read_args,
                        "result": read_result,
                        "iteration": iteration
                    })

            # Step 2: Edit the page
            edit_content = "Now I'll make the requested edit to the TestPage."
            if on_message:
                await on_message("assistant", edit_content)

            edit_tool = next((t for t in tools if t.name == "edit_page"), None)
            if edit_tool:
                iteration += 1
                # Add a test section to the page
                edit_args = {
                    "path": "TestPage.md",
                    "old_text": "# Test Page",
                    "new_text": "# Test Page\n\n> This section was added by the E2E test mock agent.",
                    "author": "Mock Agent"
                }
                print(f"🤖 MockAdapter: Calling edit_page")
                edit_result = edit_tool.function(edit_args)
                print(f"🤖 MockAdapter: edit_page result: {edit_result[:100] if edit_result else 'None'}")

                if on_tool_call:
                    await on_tool_call({
                        "tool_name": "edit_page",
                        "arguments": edit_args,
                        "result": edit_result,
                        "iteration": iteration
                    })

            # Step 3: Rename thread
            name_content = "Updating thread name to reflect the work done."
            if on_message:
                await on_message("assistant", name_content)

            name_tool = next((t for t in tools if t.name == "set_thread_name"), None)
            if name_tool:
                iteration += 1
                name_args = {"name": "docs-update"}
                print(f"🤖 MockAdapter: Calling set_thread_name with {name_args}")
                name_result = name_tool.function(name_args)
                print(f"🤖 MockAdapter: set_thread_name result: {name_result[:100] if name_result else 'None'}")

                if on_tool_call:
                    await on_tool_call({
                        "tool_name": "set_thread_name",
                        "arguments": name_args,
                        "result": name_result,
                        "iteration": iteration
                    })
            else:
                print(f"🤖 MockAdapter: WARNING - set_thread_name tool not found")

            # Step 4: Set status to done
            review_content = "I've made the changes. Ready for review."
            if on_message:
                await on_message("assistant", review_content)

            status_tool = next((t for t in tools if t.name == "set_thread_status"), None)
            if status_tool:
                iteration += 1
                status_args = {"status": "Done - ready to merge"}
                print(f"🤖 MockAdapter: Calling set_thread_status")
                status_result = status_tool.function(status_args)
                print(f"🤖 MockAdapter: set_thread_status result: {status_result[:100] if status_result else 'None'}")

                if on_tool_call:
                    await on_tool_call({
                        "tool_name": "set_thread_status",
                        "arguments": status_args,
                        "result": status_result,
                        "iteration": iteration
                    })
            else:
                print(f"🤖 MockAdapter: WARNING - set_thread_status tool not found")

            final_response = "I've completed the edit and marked it for your review."
            return ConversationResult(
                status='completed',
                stop_reason='natural_completion',
                iterations=iteration,
                final_response=final_response
            )

        # Subsequent turns (e.g., after user feedback)
        content = "I've completed my task. Please review the changes and accept or reject them."
        if on_message:
            await on_message("assistant", content)

        return ConversationResult(
            status='completed',
            stop_reason='natural_completion',
            iterations=1,
            final_response=content
        )

    async def disconnect(self):
        """Clean up mock adapter."""
        # Clean up turn counter
        if self._turn_key in MockAdapter._turn_counters:
            del MockAdapter._turn_counters[self._turn_key]
