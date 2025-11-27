/**
 * Type definitions for autonomous wiki agents
 */

export interface Agent {
  name: string;
  enabled: boolean;
  schedule: string | null;
  model: string;
}

export interface AgentExecutionResult {
  agent_name: string;
  status: 'completed' | 'stopped' | 'error';
  stop_reason: string;
  iterations: number;
  branch_created: string | null;
  pages_analyzed: number;
  execution_time: number;
  logs: string[];
  error?: string;
}

export interface DiffStats {
  files_changed: Array<{
    path: string;
    changes: string;
  }>;
  summary: string;
  raw_stat: string;
}

export interface BranchDiff {
  branch1: string;
  branch2: string;
  diff: string;
  stats: DiffStats;
}
