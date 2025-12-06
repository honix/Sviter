"""Result of accepting thread changes."""

from enum import Enum


class AcceptResult(Enum):
    SUCCESS = "success"     # Merged successfully
    CONFLICT = "conflict"   # Merge conflict, agent will resolve
    ERROR = "error"         # Unexpected error
