"""
Base class for autonomous wiki agents.
"""
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from storage.git_wiki import GitWiki


class BaseAgent:
    """
    Base class for all wiki agents.

    Each agent must define:
    - schedule: Cron expression (not used in MVP, manual only)
    - enabled: Boolean flag
    - prompt: System prompt for the AI agent
    - model: AI model to use (defaults to "openai/gpt-oss-20b")

    Execution mode properties:
    - human_in_loop: Whether agent waits for user input between turns
    - create_branch: Whether agent creates a PR branch for its work
    """

    # These should be overridden by subclasses
    schedule: str = None  # Not used in Phase 1 (manual only)
    enabled: bool = True
    prompt: str = ""
    model: str = "openai/gpt-oss-20b"  # Default AI model

    # Execution mode - defaults for interactive chat
    human_in_loop: bool = True   # Wait for user input between turns
    create_branch: bool = False  # Don't create PR branches

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

    @classmethod
    def get_model(cls) -> str:
        """Get the AI model for this agent"""
        return cls.model

    @classmethod
    def on_start(cls, wiki: 'GitWiki') -> Optional[str]:
        """
        Called before agent execution begins.

        Override in subclasses to perform setup (e.g., create branch).

        Args:
            wiki: GitWiki instance for git operations

        Returns:
            Branch name if one was created, None otherwise
        """
        return None

    @classmethod
    def on_finish(cls, wiki: 'GitWiki', branch: Optional[str], changes_made: int) -> None:
        """
        Called after agent execution completes.

        Override in subclasses to perform cleanup (e.g., delete empty branches).

        Args:
            wiki: GitWiki instance for git operations
            branch: Branch name if one was created during on_start
            changes_made: Number of changes made during execution
        """
        pass
