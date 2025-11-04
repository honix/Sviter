export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tool_calls?: ToolCall[];
  tool_count?: number;
  iterations?: number;
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
  type: 'chat' | 'chat_response' | 'tool_call' | 'system' | 'page_update' | 'error' | 'status' | 'success';
  data?: any;
  message?: string;
  tool_name?: string;
  arguments?: any;
  result?: string;
  page_id?: number;
  tool_count?: number;
  iterations?: number;
  page_modified?: boolean;
}