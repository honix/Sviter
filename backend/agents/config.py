"""
Global configuration for autonomous wiki agents.
"""


class GlobalAgentConfig:
    """System-wide agent settings"""

    # Agent system enabled
    enabled = True

    # Loop Control (prevents runaway agents)
    max_iterations = 15
    max_tools_per_iteration = 5
    timeout_seconds = 300  # 5 minutes

    # AI Model
    ai_model = "anthropic/claude-3.5-sonnet"
    temperature = 0.3

    # PR and Branch Settings
    pr_branch_prefix = "agent/"  # All agent branches start with "agent/"
    default_base_branch = "main"

    # Tags for PR workflow
    tag_review = "review"  # Tag for PRs awaiting review
    tag_approved = "approved"  # Tag for approved PRs
    tag_rejected = "rejected"  # Tag for rejected PRs

    # Resource Limits
    max_pages_per_run = 100
    max_edits_per_pr = 10
    max_prs_per_day = 20

    # Repetition Detection
    repetition_threshold = 3  # Same tool call repeated N times = stuck
