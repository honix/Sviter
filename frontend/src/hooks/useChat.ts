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
  const { connectionStatus, sendChatMessage, connect, onDirectMessage } = useWebSocket('app-main');

  // Auto-connect on initialization
  useEffect(() => {
    connect();
  }, [connect]);

  // Handle incoming WebSocket messages directly
  useEffect(() => {
    const unsubscribe = onDirectMessage((message) => {
      console.log('useChat: Direct message handler triggered with message:', message);
      console.log('useChat: Processing message type:', message.type);

      if (message.type === 'chat_response') {
        console.log('useChat: Creating chat_response message with content:', message.message);
        const chatMessage: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type: 'assistant',
          content: message.message || '',
          timestamp: new Date().toISOString()
        };

        console.log('useChat: Adding assistant message to state:', chatMessage);
        setMessages(prev => {
          console.log('useChat: Previous messages count:', prev.length);
          const newMessages = [...prev, chatMessage];
          console.log('useChat: New messages count:', newMessages.length);
          return newMessages;
        });
      } else if (message.type === 'tool_call') {
        console.log('useChat: Creating tool_call message');
        const toolCallMessage: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type: 'system',
          content: `🔧 Executed ${message.tool_name || 'tool'}: ${message.result || 'Success'}`,
          timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, toolCallMessage]);
      } else if (message.type === 'system') {
        console.log('useChat: Creating system message');
        const systemMessage: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type: 'system',
          content: message.message || '',
          timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, systemMessage]);
      }
    });

    return unsubscribe;
  }, [onDirectMessage]);

  const sendMessage = useCallback((content: string) => {
    if (!content.trim()) return;

    // Add user message to local state immediately
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
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