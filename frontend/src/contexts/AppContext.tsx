import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { Page, ViewMode } from '../types/page';
import { useWebSocket } from '../hooks/useWebSocket';
import { WebSocketMessage } from '../types/chat';

interface AppState {
  pages: Page[];
  currentPage: Page | null;
  viewMode: ViewMode;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
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
  | { type: 'SET_CONNECTED'; payload: boolean };

const initialState: AppState = {
  pages: [],
  currentPage: null,
  viewMode: 'view',
  isLoading: false,
  error: null,
  isConnected: false
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

    default:
      return state;
  }
}

interface AppContextType {
  state: AppState;
  actions: {
    setPages: (pages: Page[]) => void;
    addPage: (page: Page) => void;
    updatePage: (id: number, updates: Partial<Page>) => void;
    deletePage: (id: number) => void;
    setCurrentPage: (page: Page | null) => void;
    setViewMode: (mode: ViewMode) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    createPage: (title: string, content?: string) => Promise<void>;
  };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { connectionStatus, lastMessage, connect } = useWebSocket('app-main');

  // Handle connection status changes
  useEffect(() => {
    dispatch({ type: 'SET_CONNECTED', payload: connectionStatus === 'connected' });
  }, [connectionStatus]);

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

  // Auto-connect on initialization
  useEffect(() => {
    connect();
  }, [connect]);

  // Load pages from backend API on initialization
  useEffect(() => {
    loadPages();
  }, [loadPages]);

  const actions = {
    setPages: (pages: Page[]) => dispatch({ type: 'SET_PAGES', payload: pages }),
    addPage: (page: Page) => dispatch({ type: 'ADD_PAGE', payload: page }),
    updatePage: (id: number, updates: Partial<Page>) => dispatch({ type: 'UPDATE_PAGE', payload: { id, updates } }),
    deletePage: (id: number) => dispatch({ type: 'DELETE_PAGE', payload: id }),
    setCurrentPage: (page: Page | null) => dispatch({ type: 'SET_CURRENT_PAGE', payload: page }),
    setViewMode: (mode: ViewMode) => dispatch({ type: 'SET_VIEW_MODE', payload: mode }),
    setLoading: (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading }),
    setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),

    createPage: async (title: string, content = '') => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const newPage: Page = {
          id: Date.now(),
          title,
          content,
          author: 'user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags: []
        };

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
    <AppContext.Provider value={{ state, actions }}>
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