export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  tool_calls?: ToolCall[];
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
  type: 'chat' | 'page_update' | 'error' | 'status';
  data: any;
  page_id?: number;
}