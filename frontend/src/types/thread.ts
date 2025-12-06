/**
 * Thread types for the wiki agent system.
 *
 * A Thread represents an autonomous agent working on a git branch.
 */

export type ThreadStatus = 'working' | 'need_help' | 'review';

export interface Thread {
  id: string;
  name: string;
  goal: string;
  branch: string;
  status: ThreadStatus;
  created_at: string;
  updated_at: string;
  message_count: number;
  error?: string;
  review_summary?: string;
}

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool_call';
  content: string;
  timestamp: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: string;
}

export interface ThreadDiffStats {
  files_changed: number;
  lines_added: number;
  lines_removed: number;
  files: Array<{
    path: string;
    lines_added: number;
    lines_removed: number;
  }>;
}

/**
 * WebSocket message types for thread operations.
 */
export interface ThreadCreatedMessage {
  type: 'thread_created';
  thread: Thread;
}

export interface ThreadStatusMessage {
  type: 'thread_status';
  thread_id: string;
  status: ThreadStatus;
  message: string;
}

export interface ThreadMessageMessage {
  type: 'thread_message';
  thread_id: string;
  role: string;
  content: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
}

export interface ThreadDeletedMessage {
  type: 'thread_deleted';
  thread_id: string;
  reason: 'accepted' | 'rejected';
}

export interface ThreadListMessage {
  type: 'thread_list';
  threads: Thread[];
}

export interface ThreadSelectedMessage {
  type: 'thread_selected';
  thread_id: string | null;
  thread?: Thread;
  history: ThreadMessage[];
}

export interface ThreadDiffMessage {
  type: 'thread_diff';
  thread_id: string;
  diff_stats: ThreadDiffStats;
}

export interface AcceptConflictMessage {
  type: 'accept_conflict';
  thread_id: string;
  message: string;
}
