"""
Agents package.

Core components:
- AgentExecutor: Main execution engine for all agent types
- GlobalAgentConfig: Global configuration settings
"""

from .config import GlobalAgentConfig
from .executor import AgentExecutor, ExecutionResult

__all__ = [
    'GlobalAgentConfig',
    'AgentExecutor',
    'ExecutionResult',
]
