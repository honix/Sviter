"""
Autonomous wiki agents package.

Agents are registered here and can be executed manually or on schedule.
"""
from .base import BaseAgent
from .config import GlobalAgentConfig
from .loop_controller import AgentLoopController
from .executor import AgentExecutor, ExecutionResult

# Import agent classes
from .chat_agent import ChatAgent
from .example_agent import ExampleAgent
from .test_agent import TestAgent
from .poet_agent import PoetAgent
from .poet_agent_grok import PoetAgentGrok
from .wiki_overview_agent_grok import WikiOverviewAgentGrok
# from .integrity_checker import InformationIntegrityAgent  # Phase 2+
# from .style_checker import StyleConsistencyAgent  # Phase 2+
# from .content_enricher import ContentEnrichmentAgent  # Phase 2+

# Register all enabled agents
REGISTERED_AGENTS = [
    ChatAgent,
    ExampleAgent,
    TestAgent,
    PoetAgent,
    PoetAgentGrok,
    WikiOverviewAgentGrok,
]


def get_agent_by_name(agent_name: str) -> type[BaseAgent]:
    """
    Get agent class by name.

    Args:
        agent_name: Name of the agent (e.g., "InformationIntegrityAgent")

    Returns:
        Agent class

    Raises:
        ValueError: If agent not found
    """
    for agent_class in REGISTERED_AGENTS:
        if agent_class.get_name() == agent_name:
            return agent_class

    raise ValueError(f"Agent '{agent_name}' not found")


def list_available_agents() -> list:
    """
    List all available agents.

    Returns:
        List of agent info dictionaries
    """
    return [{
        "name": agent.get_name(),
        "enabled": agent.is_enabled(),
        "schedule": agent.schedule,
        "model": agent.get_model(),
    } for agent in REGISTERED_AGENTS]


__all__ = [
    'BaseAgent',
    'GlobalAgentConfig',
    'AgentLoopController',
    'AgentExecutor',
    'ExecutionResult',
    'REGISTERED_AGENTS',
    'get_agent_by_name',
    'list_available_agents',
]
