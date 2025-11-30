"""
Base class for autonomous agents that create PR branches.
"""
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from .base import BaseAgent
from .config import GlobalAgentConfig

if TYPE_CHECKING:
    from storage.git_wiki import GitWiki


class AgentOnBranch(BaseAgent):
    """
    Base class for autonomous agents that create PR branches for review.

    These agents:
    - Run autonomously without waiting for user input
    - Create a git branch for their work
    - Changes can be reviewed and merged via PR workflow

    Subclasses should define:
    - prompt: System prompt for the AI agent
    - model: AI model to use
    - enabled: Whether agent is enabled
    """

    # Override execution mode for autonomous operation
    human_in_loop = False  # Run autonomously
    create_branch = True   # Create PR branch for work

    @classmethod
    def on_start(cls, wiki: 'GitWiki') -> str:
        """
        Create a new branch for agent work.

        Args:
            wiki: GitWiki instance for git operations

        Returns:
            Name of the created branch
        """
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        branch_name = f"{cls.get_branch_prefix()}{timestamp}"
        wiki.create_branch(
            branch_name,
            from_branch=GlobalAgentConfig.default_base_branch,
            checkout=True
        )
        return branch_name

    @classmethod
    def on_finish(cls, wiki: 'GitWiki', branch: Optional[str], changes_made: int) -> None:
        """
        Handle cleanup after agent execution.

        - If no changes were made, delete the empty branch
        - If changes were made, stay on branch for PR review

        Args:
            wiki: GitWiki instance for git operations
            branch: Name of the branch created during on_start
            changes_made: Number of changes made during execution
        """
        if changes_made == 0 and branch:
            # No changes made - clean up empty branch
            try:
                # Must checkout main first - can't delete current branch
                wiki.checkout_branch(GlobalAgentConfig.default_base_branch)
                wiki.delete_branch(branch)
            except Exception:
                # Ignore cleanup errors
                pass
        # If changes were made, stay on branch for PR review
