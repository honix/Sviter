/**
 * API client for agent operations
 */
import type { Agent, AgentExecutionResult } from '../types/agent';

const API_BASE_URL = 'http://localhost:8000';

export class AgentsAPI {
  /**
   * Get list of all available agents
   */
  static async listAgents(): Promise<Agent[]> {
    const response = await fetch(`${API_BASE_URL}/api/agents`);
    if (!response.ok) {
      throw new Error(`Failed to fetch agents: ${response.statusText}`);
    }
    const data = await response.json();
    return data.agents;
  }

  /**
   * Manually trigger an agent execution
   */
  static async runAgent(agentName: string): Promise<AgentExecutionResult> {
    const response = await fetch(`${API_BASE_URL}/api/agents/${agentName}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to run agent: ${response.statusText}`);
    }

    const data = await response.json();
    return data.result;
  }

}
