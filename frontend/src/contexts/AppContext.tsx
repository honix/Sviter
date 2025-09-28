import React, { createContext, useContext, useReducer, useEffect, useRef, useState, useCallback } from 'react';
import { Page, ViewMode } from '../types/page';
import { createWebSocketService, WebSocketService } from '../services/websocket';
import { WebSocketMessage } from '../types/chat';

interface AppState {
  pages: Page[];
  currentPage: Page | null;
  viewMode: ViewMode;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
}

type AppAction =
  | { type: 'SET_PAGES'; payload: Page[] }
  | { type: 'ADD_PAGE'; payload: Page }
  | { type: 'UPDATE_PAGE'; payload: { id: number; updates: Partial<Page> } }
  | { type: 'DELETE_PAGE'; payload: number }
  | { type: 'SET_CURRENT_PAGE'; payload: Page | null }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_CONNECTION_STATUS'; payload: 'connecting' | 'connected' | 'disconnected' | 'error' };

const initialState: AppState = {
  pages: [],
  currentPage: null,
  viewMode: 'view',
  isLoading: false,
  error: null,
  isConnected: false,
  connectionStatus: 'disconnected'
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PAGES':
      return { ...state, pages: action.payload };

    case 'ADD_PAGE':
      return { ...state, pages: [...state.pages, action.payload] };

    case 'UPDATE_PAGE':
      const updatedPages = state.pages.map(page =>
        page.id === action.payload.id
          ? { ...page, ...action.payload.updates, updated_at: new Date().toISOString() }
          : page
      );
      const updatedCurrentPage = state.currentPage?.id === action.payload.id
        ? { ...state.currentPage, ...action.payload.updates, updated_at: new Date().toISOString() }
        : state.currentPage;

      return {
        ...state,
        pages: updatedPages,
        currentPage: updatedCurrentPage
      };

    case 'DELETE_PAGE':
      const remainingPages = state.pages.filter(page => page.id !== action.payload);
      const newCurrentPage = state.currentPage?.id === action.payload
        ? (remainingPages.length > 0 ? remainingPages[0] : null)
        : state.currentPage;

      return {
        ...state,
        pages: remainingPages,
        currentPage: newCurrentPage
      };

    case 'SET_CURRENT_PAGE':
      return { ...state, currentPage: action.payload };

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_CONNECTED':
      return { ...state, isConnected: action.payload };

    case 'SET_CONNECTION_STATUS': {
      const isConnected = action.payload === 'connected';
      return {
        ...state,
        connectionStatus: action.payload,
        isConnected
      };
    }

    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  actions: {
    setPages: (pages: Page[]) => void;
    addPage: (page: Page) => void;
    updatePage: (id: number, updates: Partial<Page>) => Promise<void>;
    deletePage: (id: number) => void;
    setCurrentPage: (page: Page | null) => void;
    setViewMode: (mode: ViewMode) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    createPage: (title: string, content?: string) => Promise<void>;
  };
  websocket: {
    sendMessage: (message: any) => void;
    sendChatMessage: (content: string) => void;
    onMessage: (handler: (message: WebSocketMessage) => void) => () => void;
    lastMessage: WebSocketMessage | null;
  };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const wsService = useRef<WebSocketService | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const messageHandlers = useRef<Set<(message: WebSocketMessage) => void>>(new Set());

  // Initialize WebSocket service
  useEffect(() => {
    wsService.current = createWebSocketService('app-main');

    const statusUnsubscribe = wsService.current.onStatusChange((status) => {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: status });
    });

    const messageUnsubscribe = wsService.current.onMessage((message) => {
      setLastMessage(message);

      // Notify all registered handlers
      messageHandlers.current.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      });
    });

    // Auto-connect
    wsService.current.connect();

    return () => {
      statusUnsubscribe();
      messageUnsubscribe();
      wsService.current?.disconnect();
    };
  }, []);

  const loadPages = React.useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const response = await fetch('http://localhost:8000/api/pages');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const backendPages: Page[] = data.pages;

      dispatch({ type: 'SET_PAGES', payload: backendPages });

      // Set current page to first page if none selected and pages exist
      if (!state.currentPage && backendPages.length > 0) {
        dispatch({ type: 'SET_CURRENT_PAGE', payload: backendPages[0] });
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load pages' });
      console.error('Error loading pages:', err);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.currentPage]);

  // Handle incoming WebSocket messages for page updates
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'page_update') {
      // Reload all pages when AI modifies them to ensure synchronization
      loadPages();
    }
  }, [lastMessage, loadPages]);


  // Load pages from backend API on initialization
  useEffect(() => {
    loadPages();
  }, [loadPages]);

  // WebSocket functions
  const sendMessage = useCallback((message: any) => {
    wsService.current?.send(message);
  }, []);

  const sendChatMessage = useCallback((content: string) => {
    wsService.current?.sendChatMessage(content);
  }, []);

  const onMessage = useCallback((handler: (message: WebSocketMessage) => void) => {
    messageHandlers.current.add(handler);
    return () => messageHandlers.current.delete(handler);
  }, []);

  const actions = {
    setPages: (pages: Page[]) => dispatch({ type: 'SET_PAGES', payload: pages }),
    addPage: (page: Page) => dispatch({ type: 'ADD_PAGE', payload: page }),
    updatePage: async (id: number, updates: Partial<Page>) => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const response = await fetch(`http://localhost:8000/api/pages/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const updatedPage = await response.json();
        dispatch({ type: 'UPDATE_PAGE', payload: { id, updates: updatedPage } });
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to update page' });
        console.error('Error updating page:', err);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    deletePage: (id: number) => dispatch({ type: 'DELETE_PAGE', payload: id }),
    setCurrentPage: (page: Page | null) => dispatch({ type: 'SET_CURRENT_PAGE', payload: page }),
    setViewMode: (mode: ViewMode) => dispatch({ type: 'SET_VIEW_MODE', payload: mode }),
    setLoading: (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading }),
    setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),

    createPage: async (title: string, content = '') => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const response = await fetch('http://localhost:8000/api/pages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title,
            content,
            author: 'user',
            tags: []
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const newPage = await response.json();
        dispatch({ type: 'ADD_PAGE', payload: newPage });
        dispatch({ type: 'SET_CURRENT_PAGE', payload: newPage });
        dispatch({ type: 'SET_VIEW_MODE', payload: 'edit' });
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to create page' });
        console.error('Error creating page:', err);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
  };

  return (
    <AppContext.Provider value={{
      state,
      actions,
      websocket: {
        sendMessage,
        sendChatMessage,
        onMessage,
        lastMessage
      }
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};