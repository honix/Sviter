/**
 * Type definitions for autonomous wiki agents
 */

export interface Agent {
  name: string;
  enabled: boolean;
  schedule: string | null;
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

export interface PullRequest {
  branch: string;
  agent_name: string;
  timestamp_str: string;
  timestamp: number;
  commit_message: string;
  diff_summary: string;
  tags: string[];
  files_changed: number;
  status?: 'approved' | 'rejected';
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

export interface PRDiff {
  branch: string;
  diff: string;
}
