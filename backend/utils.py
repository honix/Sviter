"""
Shared utility functions.
"""


def wrap_system_notification(content: str) -> str:
    """Wrap content in system_notification tags for LLM."""
    return f"<system_notification>\n{content}\n</system_notification>"
