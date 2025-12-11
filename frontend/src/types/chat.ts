export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'system_prompt' | 'tool_call';
  content: string;
  timestamp: string;
  tool_calls?: ToolCall[];
  tool_count?: number;
  iterations?: number;
  tool_name?: string;
  tool_args?: Record<string, any>;
  tool_error?: boolean;
  user_id?: string;  // Who sent this message (for collaborative threads)
}

export interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
  result?: string;
}

export interface WebSocketMessage {
  type:
    | 'chat' | 'chat_response' | 'tool_call' | 'system' | 'system_prompt' | 'page_update' | 'error' | 'status' | 'success'
    // Agent messages
    | 'agent_complete' | 'agent_selected'
    // Thread messages
    | 'thread_created' | 'thread_status' | 'thread_deleted' | 'thread_list' | 'thread_selected' | 'thread_message'
    // Branch messages
    | 'branch_created' | 'branch_switched' | 'branch_deleted'
    // Page messages
    | 'page_updated' | 'pages_changed';
  data?: any;
  message?: string;
  tool_name?: string;
  arguments?: any;
  result?: string;
  page_id?: number;
  tool_count?: number;
  iterations?: number;
  page_modified?: boolean;
  // Thread fields
  thread?: any;
  thread_id?: string;
  thread_type?: 'assistant' | 'worker';
  threads?: any[];
  history?: any[];
  role?: string;
  content?: string;
  tool_args?: any;
  status?: string;  // Thread status (working, need_help, review, accepted, rejected)
  user_id?: string;  // Who sent the message (for collaborative threads)
  // Branch fields
  branch?: string;
  branch_created?: string;
  // Page fields
  title?: string;
}