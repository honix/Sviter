import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketService, createWebSocketService, WebSocketEventHandler, ConnectionStatusHandler } from '../services/websocket';
import { WebSocketMessage } from '../types/chat';

export interface UseWebSocketReturn {
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  sendMessage: (message: any) => void;
  sendChatMessage: (content: string) => void;
  lastMessage: WebSocketMessage | null;
  connect: () => void;
  disconnect: () => void;
  onDirectMessage: (handler: (message: WebSocketMessage) => void) => () => void;
}

export const useWebSocket = (clientId?: string): UseWebSocketReturn => {
  const wsService = useRef<WebSocketService | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const messageHandlers = useRef<Set<(message: WebSocketMessage) => void>>(new Set());

  // Initialize WebSocket service
  useEffect(() => {
    wsService.current = createWebSocketService(clientId);

    const statusUnsubscribe = wsService.current.onStatusChange((status) => {
      setConnectionStatus(status);
    });

    const messageUnsubscribe = wsService.current.onMessage((message) => {
      console.log('useWebSocket: Received message, updating lastMessage state:', message);
      setLastMessage(message);

      // Also notify direct handlers immediately
      messageHandlers.current.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in direct message handler:', error);
        }
      });
    });

    return () => {
      statusUnsubscribe();
      messageUnsubscribe();
      wsService.current?.disconnect();
    };
  }, [clientId]);

  const connect = useCallback(() => {
    wsService.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    wsService.current?.disconnect();
  }, []);

  const sendMessage = useCallback((message: any) => {
    wsService.current?.send(message);
  }, []);

  const sendChatMessage = useCallback((content: string) => {
    wsService.current?.sendChatMessage(content);
  }, []);

  const onDirectMessage = useCallback((handler: (message: WebSocketMessage) => void) => {
    messageHandlers.current.add(handler);
    return () => messageHandlers.current.delete(handler);
  }, []);

  return {
    connectionStatus,
    sendMessage,
    sendChatMessage,
    lastMessage,
    connect,
    disconnect,
    onDirectMessage
  };
};

export default useWebSocket;