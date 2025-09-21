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
}

export const useWebSocket = (clientId?: string): UseWebSocketReturn => {
  const wsService = useRef<WebSocketService | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  // Initialize WebSocket service
  useEffect(() => {
    wsService.current = createWebSocketService(clientId);

    const statusUnsubscribe = wsService.current.onStatusChange((status) => {
      setConnectionStatus(status);
    });

    const messageUnsubscribe = wsService.current.onMessage((message) => {
      setLastMessage(message);
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

  return {
    connectionStatus,
    sendMessage,
    sendChatMessage,
    lastMessage,
    connect,
    disconnect
  };
};

export default useWebSocket;