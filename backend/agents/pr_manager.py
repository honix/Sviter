"""
Git-native PR management for autonomous agents.
No database required - all PR data stored in git branches and tags.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime
from storage.git_wiki import GitWiki, GitWikiException
from .config import GlobalAgentConfig


class GitPRManager:
    """
    Manage PRs using git branches and tags.

    PR workflow:
    1. Agent creates branch: agent/<agent-name>/<timestamp>
    2. Agent makes changes and commits
    3. Agent tags branch with 'review'
    4. Human reviews and either:
       - Approves: merge to main, tag 'approved', delete branch
       - Rejects: tag 'rejected', keep branch for audit
    """

    def __init__(self, wiki: GitWiki):
        """
        Initialize PR manager.

        Args:
            wiki: GitWiki instance
        """
        self.wiki = wiki
        self.tag_review = GlobalAgentConfig.tag_review
        self.tag_approved = GlobalAgentConfig.tag_approved
        self.tag_rejected = GlobalAgentConfig.tag_rejected

    def list_pending_prs(self) -> List[Dict[str, Any]]:
        """
        List all pending PRs (branches tagged 'review').

        Returns:
            List of PR dictionaries with metadata
        """
        pending = []

        # Get all agent branches
        agent_branches = self.wiki.list_branches_with_prefix(GlobalAgentConfig.pr_branch_prefix)

        for branch in agent_branches:
            # Check if tagged 'review'
            tags = self.wiki.get_branch_tags(branch)

            if self.tag_review in tags:
                # Extract PR info
                pr_info = self._get_pr_info(branch)
                pending.append(pr_info)

        # Sort by timestamp (most recent first)
        pending.sort(key=lambda x: x.get('timestamp', 0), reverse=True)

        return pending

    def list_recent_prs(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        List recent approved/rejected PRs.

        Args:
            limit: Maximum number of PRs to return

        Returns:
            List of PR dictionaries
        """
        recent = []

        # Get all agent branches (including deleted ones via tags)
        agent_branches = self.wiki.list_branches_with_prefix(GlobalAgentConfig.pr_branch_prefix)

        for branch in agent_branches:
            tags = self.wiki.get_branch_tags(branch)

            # Include if approved or rejected
            if self.tag_approved in tags or self.tag_rejected in tags:
                pr_info = self._get_pr_info(branch)
                pr_info['status'] = 'approved' if self.tag_approved in tags else 'rejected'
                recent.append(pr_info)

        # Sort by timestamp (most recent first)
        recent.sort(key=lambda x: x.get('timestamp', 0), reverse=True)

        return recent[:limit]

    def _get_pr_info(self, branch: str) -> Dict[str, Any]:
        """
        Extract PR information from a branch.

        Args:
            branch: Branch name

        Returns:
            PR info dictionary
        """
        try:
            # Parse branch name: agent/<agent-name>/<timestamp>
            parts = branch.split('/')
            agent_name = parts[1] if len(parts) > 1 else "unknown"
            timestamp_str = parts[2] if len(parts) > 2 else ""

            # Get commit message
            commit_msg = self.wiki.get_commit_message(branch)

            # Get diff stats
            try:
                diff_stats = self.wiki.get_diff_stat(GlobalAgentConfig.default_base_branch, branch)
                summary = diff_stats.get('summary', '')
            except GitWikiException:
                summary = "Unable to get diff stats"

            # Get tags
            tags = self.wiki.get_branch_tags(branch)

            return {
                "branch": branch,
                "agent_name": agent_name,
                "timestamp_str": timestamp_str,
                "timestamp": self._parse_timestamp(timestamp_str),
                "commit_message": commit_msg,
                "diff_summary": summary,
                "tags": tags,
                "files_changed": len(diff_stats.get('files_changed', [])) if 'diff_stats' in locals() else 0
            }
        except Exception as e:
            # Return minimal info on error
            return {
                "branch": branch,
                "agent_name": "unknown",
                "error": str(e)
            }

    def _parse_timestamp(self, timestamp_str: str) -> int:
        """
        Parse timestamp from branch name.

        Args:
            timestamp_str: Timestamp string (format: YYYYMMDD-HHMMSS)

        Returns:
            Unix timestamp
        """
        try:
            # Format: 20250312-143022
            dt = datetime.strptime(timestamp_str, "%Y%m%d-%H%M%S")
            return int(dt.timestamp())
        except Exception:
            return 0

    def get_pr_diff(self, branch: str) -> str:
        """
        Get unified diff for a PR.

        Args:
            branch: Branch name

        Returns:
            Unified diff string
        """
        try:
            return self.wiki.get_diff(GlobalAgentConfig.default_base_branch, branch)
        except GitWikiException as e:
            raise GitWikiException(f"Failed to get diff for branch '{branch}': {e}")

    def get_pr_diff_stats(self, branch: str) -> Dict[str, Any]:
        """
        Get diff statistics for a PR.

        Args:
            branch: Branch name

        Returns:
            Diff stats dictionary
        """
        try:
            return self.wiki.get_diff_stat(GlobalAgentConfig.default_base_branch, branch)
        except GitWikiException as e:
            raise GitWikiException(f"Failed to get diff stats for branch '{branch}': {e}")

    def approve_and_merge(self, branch: str, author: str = "Human Reviewer") -> bool:
        """
        Approve and merge a PR.

        Args:
            branch: Branch name to approve
            author: Reviewer name

        Returns:
            True if successful

        Raises:
            GitWikiException: If merge fails
        """
        try:
            # Verify branch exists and is tagged for review
            tags = self.wiki.get_branch_tags(branch)
            if self.tag_review not in tags:
                raise GitWikiException(f"Branch '{branch}' is not tagged for review")

            # Merge to main
            self.wiki.merge_branch(
                source_branch=branch,
                target_branch=GlobalAgentConfig.default_base_branch,
                author=author,
                no_ff=True
            )

            # Tag as approved
            self.wiki.tag_branch(self.tag_approved, branch_name=branch)

            # Delete branch
            self.wiki.delete_branch(branch)

            return True
        except GitWikiException as e:
            raise GitWikiException(f"Failed to approve PR '{branch}': {e}")

    def reject_pr(self, branch: str, reason: Optional[str] = None) -> bool:
        """
        Reject a PR.

        Args:
            branch: Branch name to reject
            reason: Optional rejection reason

        Returns:
            True if successful

        Raises:
            GitWikiException: If tagging fails
        """
        try:
            # Verify branch exists and is tagged for review
            tags = self.wiki.get_branch_tags(branch)
            if self.tag_review not in tags:
                raise GitWikiException(f"Branch '{branch}' is not tagged for review")

            # Tag as rejected
            tag_message = f"Rejected: {reason}" if reason else "Rejected by reviewer"
            self.wiki.tag_branch(self.tag_rejected, branch_name=branch, message=tag_message)

            # Keep branch for audit trail (don't delete)
            return True
        except GitWikiException as e:
            raise GitWikiException(f"Failed to reject PR '{branch}': {e}")
