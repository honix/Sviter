import { useState, useCallback, useEffect } from 'react';
import { ChatMessage, WebSocketMessage } from '../types/chat';
import { useWebSocket } from './useWebSocket';

export interface UseChatReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  connectionStatus: string;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

export const useChat = (): UseChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { connectionStatus, sendChatMessage, lastMessage, connect } = useWebSocket();

  // Auto-connect on initialization
  useEffect(() => {
    connect();
  }, [connect]);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'chat') {
      const chatMessage: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'assistant',
        content: lastMessage.data.content,
        timestamp: lastMessage.data.timestamp || new Date().toISOString(),
        tool_calls: lastMessage.data.tool_calls
      };

      setMessages(prev => [...prev, chatMessage]);
    }
  }, [lastMessage]);

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;

    // Add user message to local state immediately
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);

    // Send via WebSocket
    sendChatMessage(content);
  }, [sendChatMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    sendMessage,
    clearMessages
  };
};