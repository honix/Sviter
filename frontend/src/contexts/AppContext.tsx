import React, { createContext, useContext, useReducer, useEffect, useRef, useState, useCallback } from 'react';
import { Page, ViewMode, TreeItem } from '../types/page';
import { createWebSocketService, WebSocketService } from '../services/websocket';
import { WebSocketMessage } from '../types/chat';
import { treeApi } from '../services/tree-api';

interface AppState {
  pages: Page[];
  currentPage: Page | null;
  viewMode: ViewMode;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  // Agent state
  rightPanelMode: 'chat' | 'agents';
  centerPanelMode: 'page' | 'branch-diff';
  selectedBranchForDiff: string | null;
  // Chat mode state
  chatMode: 'interactive' | 'agent-viewing';
  currentAgent: string | null; // null = ChatAgent (interactive), else agent name
  currentAgentModel: string | null; // Model being used by current agent
  // Page tree state
  pageTree: TreeItem[];
  expandedFolders: string[];
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
  | { type: 'SET_CONNECTION_STATUS'; payload: 'connecting' | 'connected' | 'disconnected' | 'error' }
  | { type: 'SET_RIGHT_PANEL_MODE'; payload: 'chat' | 'agents' }
  | { type: 'SET_CENTER_PANEL_MODE'; payload: 'page' | 'branch-diff' }
  | { type: 'SET_SELECTED_BRANCH_FOR_DIFF'; payload: string | null }
  | { type: 'SET_CHAT_MODE'; payload: 'interactive' | 'agent-viewing' }
  | { type: 'SET_CURRENT_AGENT'; payload: string | null }
  | { type: 'SET_CURRENT_AGENT_MODEL'; payload: string | null }
  | { type: 'SET_PAGE_TREE'; payload: TreeItem[] }
  | { type: 'TOGGLE_FOLDER'; payload: string };

const initialState: AppState = {
  pages: [],
  currentPage: null,
  viewMode: 'view',
  isLoading: false,
  error: null,
  isConnected: false,
  connectionStatus: 'disconnected',
  rightPanelMode: 'chat',
  centerPanelMode: 'page',
  selectedBranchForDiff: null,
  chatMode: 'interactive',
  currentAgent: null,
  currentAgentModel: null, // Will be fetched from backend
  pageTree: [],
  expandedFolders: []
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PAGES':
      return { ...state, pages: action.payload };

    case 'ADD_PAGE':
      return { ...state, pages: [...state.pages, action.payload] };

    case 'UPDATE_PAGE':
      const updatedPages = state.pages.map(page =>
        page.title === action.payload.title
          ? { ...page, ...action.payload.updates, updated_at: new Date().toISOString() }
          : page
      );
      const updatedCurrentPage = state.currentPage?.title === action.payload.title
        ? { ...state.currentPage, ...action.payload.updates, updated_at: new Date().toISOString() }
        : state.currentPage;

      return {
        ...state,
        pages: updatedPages,
        currentPage: updatedCurrentPage
      };

    case 'DELETE_PAGE':
      const remainingPages = state.pages.filter(page => page.title !== action.payload);
      const newCurrentPage = state.currentPage?.title === action.payload
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

    case 'SET_RIGHT_PANEL_MODE':
      return { ...state, rightPanelMode: action.payload };

    case 'SET_CENTER_PANEL_MODE':
      return { ...state, centerPanelMode: action.payload };

    case 'SET_SELECTED_BRANCH_FOR_DIFF':
      return { ...state, selectedBranchForDiff: action.payload };

    case 'SET_CHAT_MODE':
      return { ...state, chatMode: action.payload };

    case 'SET_CURRENT_AGENT':
      return { ...state, currentAgent: action.payload };

    case 'SET_CURRENT_AGENT_MODEL':
      return { ...state, currentAgentModel: action.payload };

    case 'SET_PAGE_TREE':
      return { ...state, pageTree: action.payload };

    case 'TOGGLE_FOLDER': {
      const isExpanded = state.expandedFolders.includes(action.payload);
      return {
        ...state,
        expandedFolders: isExpanded
          ? state.expandedFolders.filter(id => id !== action.payload)
          : [...state.expandedFolders, action.payload]
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
    updatePage: (title: string, updates: Partial<Page>) => Promise<void>;
    deletePage: (title: string) => Promise<void>;
    setCurrentPage: (page: Page | null) => Promise<void>;
    setViewMode: (mode: ViewMode) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    createPage: (title: string, content?: string) => Promise<void>;
    setRightPanelMode: (mode: 'chat' | 'agents') => void;
    setCenterPanelMode: (mode: 'page' | 'branch-diff') => void;
    setSelectedBranchForDiff: (branch: string | null) => void;
    viewBranchDiff: (branch: string) => void;
    closeBranchDiff: () => void;
    setChatMode: (mode: 'interactive' | 'agent-viewing') => void;
    setCurrentAgent: (agent: string | null) => void;
    setCurrentAgentModel: (model: string | null) => void;
    startNewChat: () => Promise<void>;
    viewAgentExecution: (agentName: string, agentModel?: string) => void;
    // Tree actions
    loadPageTree: () => Promise<void>;
    toggleFolder: (folderId: string) => void;
    moveItem: (sourcePath: string, targetParentPath: string | null, newOrder: number) => Promise<void>;
    createFolder: (name: string, parentPath?: string) => Promise<void>;
    deleteFolder: (path: string) => Promise<void>;
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

  // Helper function to fetch and set ChatAgent model
  const fetchChatAgentModel = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/api/agents');
      const data = await response.json();
      const chatAgent = data.agents.find((a: any) => a.name === 'ChatAgent');
      dispatch({ type: 'SET_CURRENT_AGENT_MODEL', payload: chatAgent?.model || null });
    } catch (error) {
      console.error('Failed to fetch ChatAgent model:', error);
      dispatch({ type: 'SET_CURRENT_AGENT_MODEL', payload: null });
    }
  }, []);

  // Fetch ChatAgent model on initialization
  useEffect(() => {
    fetchChatAgentModel();
  }, [fetchChatAgentModel]);

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
        // Fetch full content for the first page
        try {
          const pageResponse = await fetch(`http://localhost:8000/api/pages/${encodeURIComponent(backendPages[0].title)}`);
          if (pageResponse.ok) {
            const fullPage = await pageResponse.json();
            dispatch({ type: 'SET_CURRENT_PAGE', payload: fullPage });
          } else {
            dispatch({ type: 'SET_CURRENT_PAGE', payload: backendPages[0] });
          }
        } catch (pageErr) {
          console.error('Error loading first page content:', pageErr);
          dispatch({ type: 'SET_CURRENT_PAGE', payload: backendPages[0] });
        }
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
    updatePage: async (title: string, updates: Partial<Page>) => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const response = await fetch(`http://localhost:8000/api/pages/${encodeURIComponent(title)}`, {
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
        dispatch({ type: 'UPDATE_PAGE', payload: { title, updates: updatedPage } });
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to update page' });
        console.error('Error updating page:', err);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    deletePage: async (title: string) => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const response = await fetch(`http://localhost:8000/api/pages/${encodeURIComponent(title)}?author=user`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        dispatch({ type: 'DELETE_PAGE', payload: title });
        // Reload tree to reflect deletion
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to delete page' });
        console.error('Error deleting page:', err);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    setCurrentPage: async (page: Page | null) => {
      if (!page) {
        dispatch({ type: 'SET_CURRENT_PAGE', payload: null });
        return;
      }

      // Fetch full page content from API
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const response = await fetch(`http://localhost:8000/api/pages/${encodeURIComponent(page.title)}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const fullPage = await response.json();
        dispatch({ type: 'SET_CURRENT_PAGE', payload: fullPage });
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to load page content' });
        console.error('Error loading page:', err);
        // Fallback to the page object without content
        dispatch({ type: 'SET_CURRENT_PAGE', payload: page });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
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
        // Reload tree to show new page
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to create page' });
        console.error('Error creating page:', err);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },

    // Agent actions
    setRightPanelMode: (mode: 'chat' | 'agents') => dispatch({ type: 'SET_RIGHT_PANEL_MODE', payload: mode }),
    setCenterPanelMode: (mode: 'page' | 'branch-diff') => dispatch({ type: 'SET_CENTER_PANEL_MODE', payload: mode }),
    setSelectedBranchForDiff: (branch: string | null) => dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: branch }),
    viewBranchDiff: (branch: string) => {
      dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: branch });
      dispatch({ type: 'SET_CENTER_PANEL_MODE', payload: 'branch-diff' });
    },
    closeBranchDiff: () => {
      dispatch({ type: 'SET_CENTER_PANEL_MODE', payload: 'page' });
      dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: null });
    },
    setChatMode: (mode: 'interactive' | 'agent-viewing') => dispatch({ type: 'SET_CHAT_MODE', payload: mode }),
    setCurrentAgent: (agent: string | null) => dispatch({ type: 'SET_CURRENT_AGENT', payload: agent }),
    setCurrentAgentModel: (model: string | null) => dispatch({ type: 'SET_CURRENT_AGENT_MODEL', payload: model }),
    startNewChat: async () => {
      // Reset to interactive chat mode
      dispatch({ type: 'SET_CHAT_MODE', payload: 'interactive' });
      dispatch({ type: 'SET_CURRENT_AGENT', payload: null });

      // Fetch ChatAgent model from backend
      await fetchChatAgentModel();

      dispatch({ type: 'SET_RIGHT_PANEL_MODE', payload: 'chat' });
      // Send reset message to backend
      wsService.current?.send({ type: 'reset' });
    },
    viewAgentExecution: (agentName: string, agentModel?: string) => {
      // Switch to chat tab in agent-viewing mode
      dispatch({ type: 'SET_CHAT_MODE', payload: 'agent-viewing' });
      dispatch({ type: 'SET_CURRENT_AGENT', payload: agentName });
      dispatch({ type: 'SET_CURRENT_AGENT_MODEL', payload: agentModel || null });
      dispatch({ type: 'SET_RIGHT_PANEL_MODE', payload: 'chat' });
    },

    // Tree actions
    loadPageTree: async () => {
      try {
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
      } catch (err) {
        console.error('Failed to load page tree:', err);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to load page tree' });
      }
    },

    toggleFolder: (folderId: string) => {
      dispatch({ type: 'TOGGLE_FOLDER', payload: folderId });
    },

    moveItem: async (sourcePath: string, targetParentPath: string | null, newOrder: number) => {
      try {
        await treeApi.moveItem({ sourcePath, targetParentPath, newOrder });
        // Reload tree after move
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
        // Also reload pages to update any changed paths
        const response = await fetch('http://localhost:8000/api/pages');
        if (response.ok) {
          const data = await response.json();
          dispatch({ type: 'SET_PAGES', payload: data.pages });
        }
      } catch (err) {
        console.error('Failed to move item:', err);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to move item' });
        // Reload tree to ensure we have fresh paths even on error
        try {
          const tree = await treeApi.getTree();
          dispatch({ type: 'SET_PAGE_TREE', payload: tree });
        } catch (e) {
          console.error('Failed to reload tree:', e);
        }
      }
    },

    createFolder: async (name: string, parentPath?: string) => {
      try {
        await treeApi.createFolder({ name, parentPath: parentPath || null });
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
      } catch (err) {
        console.error('Failed to create folder:', err);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to create folder' });
      }
    },

    deleteFolder: async (path: string) => {
      try {
        await treeApi.deleteFolder(path);
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
      } catch (err) {
        console.error('Failed to delete folder:', err);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to delete folder' });
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