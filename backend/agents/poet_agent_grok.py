"""
Poet Agent Grok - creates poetry pages using Grok model.
"""
from .poet_agent import PoetAgent


class PoetAgentGrok(PoetAgent):
    """
    Poet agent that uses Grok model instead of default.
    Inherits all behavior from PoetAgent but with different model.
    """

    model = "x-ai/grok-4.1-fast:free"
