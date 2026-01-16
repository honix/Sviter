/**
 * Thread types for the wiki agent system.
 *
 * A Thread represents a conversation container - either an assistant (read-only)
 * or a worker (autonomous agent working on a git branch).
 */

export type ThreadType = 'assistant' | 'worker';

// Status is now a free-form string - agent can set any status
export type ThreadStatus = string;

// Terminal statuses that indicate a thread is finished
export const TERMINAL_STATUSES = ['accepted', 'archived'] as const;

export interface Thread {
  id: string;
  name: string;
  type: ThreadType;
  owner_id: string;
  status: ThreadStatus;
  goal?: string;           // Required for worker, optional for assistant
  branch?: string;         // Only workers have branches (hidden in UI for collaborative)
  worktree_path?: string;  // Only workers have worktrees
  is_generating?: boolean;
  created_at: string;
  updated_at: string;
  message_count?: number;
  error?: string;
  review_summary?: string;
  thread_type?: string;    // Legacy compatibility field from backend
  merge_blocked?: boolean; // True if merge is blocked by active editors
  blocked_pages?: Record<string, string[]>; // Page path -> list of client IDs editing
  participants?: string[]; // All participants (owner + shared users)
  attention_reasons?: string[]; // Why this thread needs user's attention
  needs_attention?: boolean; // Quick check for inbox filtering
  collaborative?: boolean; // True for user-initiated collaborative threads
}

export interface ThreadMessage {
  id: string;
  /** Role from backend: user, assistant, system, system_prompt, or tool_call */
  role: 'user' | 'assistant' | 'system' | 'system_prompt' | 'tool_call';
  content: string;
  timestamp: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
  tool_result?: string;
  user_id?: string;  // Who sent this message (for collaborative threads)
  user_name?: string;  // Display name for the user (for proper initials)
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
  reason: 'accepted' | 'archived';
}

export interface ThreadListMessage {
  type: 'thread_list';
  threads: Thread[];
}

export interface ThreadSelectedMessage {
  type: 'thread_selected';
  thread_id: string | null;
  thread_type?: ThreadType;  // 'assistant' or 'worker'
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
