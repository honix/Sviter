"""
Loop control for autonomous wiki agents.
Prevents infinite loops and runaway behavior.
"""
import time
import json
from typing import Tuple, List, Dict, Any
from .config import GlobalAgentConfig


class AgentLoopController:
    """
    Multi-layered loop control for autonomous agents.
    Implements 5 layers of protection against runaway loops.
    """

    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize loop controller.

        Args:
            config: Optional configuration overrides
        """
        config = config or {}

        self.max_iterations = config.get('max_iterations', GlobalAgentConfig.max_iterations)
        self.max_tools_per_iteration = config.get('max_tools_per_iteration', GlobalAgentConfig.max_tools_per_iteration)
        self.timeout_seconds = config.get('timeout_seconds', GlobalAgentConfig.timeout_seconds)
        self.repetition_threshold = config.get('repetition_threshold', GlobalAgentConfig.repetition_threshold)

        # Tracking state
        self.start_time = time.time()
        self.tool_call_history: List[str] = []
        self.pages_analyzed: set = set()
        self.changes_made: List[Dict] = []

    def should_continue(self, iteration: int, tool_calls: List[Dict],
                       message_content: str) -> Tuple[bool, str]:
        """
        Check if agent should continue execution.

        Returns:
            Tuple of (should_continue: bool, reason: str)
        """

        # Layer 1: Hard limits
        if iteration >= self.max_iterations:
            return False, "max_iterations_reached"

        if time.time() - self.start_time > self.timeout_seconds:
            return False, "timeout_exceeded"

        if len(tool_calls) > self.max_tools_per_iteration:
            return False, "too_many_tools_per_iteration"

        # Layer 2: Repetition detection
        if self._detect_repetitive_calls(tool_calls):
            return False, "repetitive_behavior_detected"

        # Layer 3: Explicit completion signals
        completion_signals = ["AGENT_COMPLETE", "TASK_DONE", "NO_MORE_ISSUES", "FINISHED"]
        if any(signal in message_content.upper() for signal in completion_signals):
            return False, "explicit_completion_signal"

        # Layer 4: Natural completion (no tool calls)
        if not tool_calls:
            return False, "natural_completion"

        # Layer 5: Resource exhaustion
        if len(self.pages_analyzed) > GlobalAgentConfig.max_pages_per_run:
            return False, "page_analysis_limit_reached"

        if len(self.changes_made) > GlobalAgentConfig.max_edits_per_pr:
            return False, "edit_limit_reached"

        # Continue execution
        return True, "continue"

    def _detect_repetitive_calls(self, current_tool_calls: List[Dict]) -> bool:
        """
        Detect if agent is stuck in a loop.

        Args:
            current_tool_calls: List of tool calls in current iteration

        Returns:
            True if repetitive behavior detected
        """
        for tool_call in current_tool_calls:
            # Create signature from tool name and arguments
            signature = f"{tool_call.get('name')}:{json.dumps(tool_call.get('arguments', {}), sort_keys=True)}"

            # Check recent history for repetitions
            recent_history = self.tool_call_history[-5:] if len(self.tool_call_history) >= 5 else self.tool_call_history
            repetition_count = recent_history.count(signature)

            if repetition_count >= self.repetition_threshold:
                return True

            # Add to history
            self.tool_call_history.append(signature)

        return False

    def record_page_analyzed(self, page_title: str):
        """Record that a page was analyzed"""
        self.pages_analyzed.add(page_title)

    def record_change(self, change_info: Dict):
        """Record a change made by the agent"""
        self.changes_made.append(change_info)

    def get_stats(self) -> Dict[str, Any]:
        """
        Get execution statistics.

        Returns:
            Dictionary with stats
        """
        elapsed = time.time() - self.start_time

        return {
            "elapsed_seconds": round(elapsed, 2),
            "pages_analyzed": len(self.pages_analyzed),
            "changes_made": len(self.changes_made),
            "tool_calls": len(self.tool_call_history),
            "unique_tool_calls": len(set(self.tool_call_history))
        }
