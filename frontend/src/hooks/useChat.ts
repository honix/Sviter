import { useState, useCallback, useEffect } from 'react';
import { ChatMessage, WebSocketMessage } from '../types/chat';
import { useAppContext } from '../contexts/AppContext';

export interface UseChatReturn {
  messages: ChatMessage[];
  isConnected: boolean;
  connectionStatus: string;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

export const useChat = (): UseChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { state, websocket } = useAppContext();

  // Handle incoming WebSocket messages directly
  useEffect(() => {
    const unsubscribe = websocket.onMessage((message) => {
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

        // Trigger page refresh if pages were modified
        if (message.page_modified) {
          console.log('useChat: Pages were modified, triggering refresh');
          // Dispatch a custom event that the page tree can listen to
          window.dispatchEvent(new CustomEvent('pagesModified'));
        }
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
      } else if (message.type === 'system_prompt') {
        console.log('useChat: Creating system_prompt message');
        const systemPromptMessage: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type: 'system',
          content: `🤖 Agent Initialized\n\n${message.message || message.content || ''}`,
          timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, systemPromptMessage]);
      } else if (message.type === 'agent_complete') {
        console.log('useChat: Creating agent_complete message');
        const agentCompleteMessage: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type: 'system',
          content: `✅ Agent Execution Complete\nStatus: ${message.status || 'completed'}\nIterations: ${message.iterations || 0}${message.branch_created ? `\nBranch: ${message.branch_created}` : ''}`,
          timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, agentCompleteMessage]);
      } else if (message.type === 'agent_selected') {
        // Agent changed - clear messages and show welcome
        console.log('useChat: Agent selected, clearing messages');
        setMessages([]);
      }
    });

    return unsubscribe;
  }, [websocket]);

  const sendMessage = useCallback((content: string) => {
    console.log('🎯 useChat.sendMessage called with:', content);
    if (!content.trim()) {
      console.log('❌ Empty content, not sending');
      return;
    }

    // Add user message to local state immediately
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      type: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    console.log('➕ Adding user message to state:', userMessage);
    setMessages(prev => [...prev, userMessage]);

    // Send via WebSocket
    console.log('📡 Calling websocket.sendChatMessage with:', content);
    websocket.sendChatMessage(content);
    console.log('✅ websocket.sendChatMessage called');
  }, [websocket]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    isConnected: state.isConnected,
    connectionStatus: state.connectionStatus,
    sendMessage,
    clearMessages
  };
};