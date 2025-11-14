"""
Base class for autonomous wiki agents.
"""
from typing import Optional


class BaseAgent:
    """
    Base class for all wiki agents.

    Each agent must define:
    - schedule: Cron expression (not used in MVP, manual only)
    - enabled: Boolean flag
    - prompt: System prompt for the AI agent
    """

    # These should be overridden by subclasses
    schedule: str = None  # Not used in Phase 1 (manual only)
    enabled: bool = True
    prompt: str = ""

    @classmethod
    def get_name(cls) -> str:
        """Get agent name from class name"""
        return cls.__name__

    @classmethod
    def get_branch_prefix(cls) -> str:
        """Get the branch prefix for this agent's PRs"""
        # Convert CamelCase to kebab-case
        name = cls.get_name()
        # Simple conversion: just lowercase for now
        return f"agent/{name.lower()}/"

    @classmethod
    def is_enabled(cls) -> bool:
        """Check if agent is enabled"""
        return cls.enabled

    @classmethod
    def get_prompt(cls) -> str:
        """Get the system prompt for this agent"""
        return cls.prompt
