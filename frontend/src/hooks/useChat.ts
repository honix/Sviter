import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ChatMessage } from '../types/chat';
import { useAppContext } from '../contexts/AppContext';

export interface UseChatReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  connectionStatus: string;
  isGenerating: boolean;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

/**
 * Hook for managing chat with a specific thread.
 * Messages are read from state.threadMessages (managed by AppContext).
 */
export const useChat = (threadId: string): UseChatReturn => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { state, websocket, actions } = useAppContext();

  // Convert thread messages from state to ChatMessage format
  const messages: ChatMessage[] = useMemo(() => {
    if (!threadId) return [];

    const storedMessages = state.threadMessages[threadId] || [];
    return storedMessages.map((msg) => {
      // Handle both 'timestamp' (from WebSocket thread_message) and 'created_at' (from backend history)
      const msgAny = msg as ThreadMessage & { created_at?: string };
      const timestamp = msg.timestamp || msgAny.created_at || new Date().toISOString();

      return {
        id: msg.id,
        type: msg.role === 'user' ? 'user'
            : msg.role === 'tool_call' ? 'tool_call'
            : msg.role === 'system_prompt' ? 'system_prompt'
            : msg.role === 'system' ? 'system_prompt'  // Treat system same as system_prompt for styling
            : 'assistant',
        content: msg.content,
        timestamp,
        tool_name: msg.tool_name,
        tool_args: msg.tool_args as Record<string, unknown>,
        // Detect tool errors by content starting with "Error:"
        tool_error: msg.role === 'tool_call' && msg.content.startsWith('Error:'),
        user_id: msg.user_id,  // Who sent this message (for collaborative threads)
        user_name: msg.user_name  // Display name for proper initials
      } as ChatMessage;
    });
  }, [threadId, state.threadMessages]);

  // Listen for agent_start/agent_complete to sync isGenerating across all users
  useEffect(() => {
    if (!threadId) return;

    const unsubscribe = websocket.onMessage((message) => {
      // Only process messages for this thread
      if (message.thread_id && message.thread_id !== threadId) {
        return;
      }

      // Initialize generating state when thread is selected (includes is_generating in thread data)
      if (message.type === 'thread_selected' && message.thread?.is_generating !== undefined) {
        setIsGenerating(message.thread.is_generating);
      }
      // Set generating state when agent starts (broadcast to all users)
      if (message.type === 'agent_start') {
        setIsGenerating(true);
      }
      // Clear generating state when agent completes its turn
      if (message.type === 'agent_complete') {
        setIsGenerating(false);
      }
      // Legacy support for simple chat_response (single message, no tool calls)
      if (message.type === 'chat_response') {
        setIsGenerating(false);
      }
    });

    return unsubscribe;
  }, [websocket, threadId]);

  const sendMessage = useCallback((content: string) => {
    if (!content.trim() || !threadId) {
      return;
    }

    // Only add message locally for assistant threads (not broadcast)
    // Worker threads get the message via broadcast, so don't add locally to avoid duplicates
    const isAssistantThread = threadId === state.assistantThreadId;
    if (isAssistantThread) {
      actions.addThreadMessage(threadId, 'user', content);
    }
    setIsGenerating(true);

    // Send via WebSocket - AppContext will store the response
    websocket.sendChatMessage(content);
  }, [websocket, threadId, actions, state.assistantThreadId]);

  const clearMessages = useCallback(() => {
    // Note: This clears local generating state but messages are managed by AppContext
    setIsGenerating(false);
  }, []);

  return {
    messages,
    isConnected: state.isConnected,
    connectionStatus: state.connectionStatus,
    isGenerating,
    sendMessage,
    clearMessages
  };
};
