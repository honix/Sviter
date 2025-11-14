/**
 * API client for agent operations
 */
import type { Agent, AgentExecutionResult, PullRequest, DiffStats, PRDiff } from '../types/agent';

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

  /**
   * Get all pending pull requests
   */
  static async getPendingPRs(): Promise<PullRequest[]> {
    const response = await fetch(`${API_BASE_URL}/api/prs/pending`);
    if (!response.ok) {
      throw new Error(`Failed to fetch pending PRs: ${response.statusText}`);
    }
    const data = await response.json();
    return data.prs;
  }

  /**
   * Get recent approved/rejected PRs
   */
  static async getRecentPRs(limit: number = 10): Promise<PullRequest[]> {
    const response = await fetch(`${API_BASE_URL}/api/prs/recent?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch recent PRs: ${response.statusText}`);
    }
    const data = await response.json();
    return data.prs;
  }

  /**
   * Get unified diff for a PR
   */
  static async getPRDiff(branch: string): Promise<PRDiff> {
    const response = await fetch(`${API_BASE_URL}/api/prs/${encodeURIComponent(branch)}/diff`);
    if (!response.ok) {
      throw new Error(`Failed to fetch PR diff: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Get diff statistics for a PR
   */
  static async getPRStats(branch: string): Promise<DiffStats> {
    const response = await fetch(`${API_BASE_URL}/api/prs/${encodeURIComponent(branch)}/stats`);
    if (!response.ok) {
      throw new Error(`Failed to fetch PR stats: ${response.statusText}`);
    }
    const data = await response.json();
    return data.stats;
  }

  /**
   * Approve and merge a PR
   */
  static async approvePR(branch: string, author: string = 'Human Reviewer'): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/prs/${encodeURIComponent(branch)}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ author }),
    });

    if (!response.ok) {
      throw new Error(`Failed to approve PR: ${response.statusText}`);
    }
  }

  /**
   * Reject a PR
   */
  static async rejectPR(branch: string, reason?: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/prs/${encodeURIComponent(branch)}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      throw new Error(`Failed to reject PR: ${response.statusText}`);
    }
  }
}
