import React, { createContext, useContext, useReducer, useEffect, useRef, useState, useCallback } from 'react';
import type { Page, ViewMode, TreeItem } from '../types/page';
import { createWebSocketService, WebSocketService } from '../services/websocket';
import type { WebSocketMessage } from '../types/chat';
import { treeApi } from '../services/tree-api';
import type { Thread, ThreadMessage, ThreadStatus } from '../types/thread';
import { useAuth } from './AuthContext';
import { invalidateSessions } from '../services/collab';
import { getApiUrl } from '../utils/url';
import { getAuthHeaders } from '../services/auth-api';
import { toast } from 'sonner';

interface AppState {
  pages: Page[];
  currentPage: Page | null;
  viewMode: ViewMode;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  // Panel mode
  centerPanelMode: 'page' | 'branch-diff';
  selectedBranchForDiff: string | null;
  // Thread state (replaces agent state)
  threads: Thread[];  // Worker threads only
  selectedThreadId: string | null;  // Currently viewed thread (assistant or worker)
  assistantThreadId: string | null;  // Assistant thread ID (received from backend on connect)
  threadMessages: Record<string, ThreadMessage[]>;  // thread_id -> messages
  // Page tree state
  pageTree: TreeItem[];
  expandedFolders: string[];
  // Branch state (for diff view)
  currentBranch: string;
  branchViewMode: 'preview' | 'diff' | 'history';
  // Refresh trigger for real-time updates
  pageUpdateCounter: number;
  // Thread creation loading state
  isCreatingThread: boolean;
}

type AppAction =
  | { type: 'SET_PAGES'; payload: Page[] }
  | { type: 'ADD_PAGE'; payload: Page }
  | { type: 'UPDATE_PAGE'; payload: { title: string; updates: Partial<Page> } }
  | { type: 'DELETE_PAGE'; payload: string }
  | { type: 'SET_CURRENT_PAGE'; payload: Page | null }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_CONNECTION_STATUS'; payload: 'connecting' | 'connected' | 'disconnected' | 'error' }
  | { type: 'SET_CENTER_PANEL_MODE'; payload: 'page' | 'branch-diff' }
  | { type: 'SET_SELECTED_BRANCH_FOR_DIFF'; payload: string | null }
  // Thread actions
  | { type: 'SET_THREADS'; payload: Thread[] }
  | { type: 'ADD_THREAD'; payload: Thread }
  | { type: 'UPDATE_THREAD'; payload: { id: string; updates: Partial<Thread> } }
  | { type: 'REMOVE_THREAD'; payload: string }
  | { type: 'SELECT_THREAD'; payload: string | null }
  | { type: 'SET_ASSISTANT_THREAD_ID'; payload: string }
  | { type: 'ADD_THREAD_MESSAGE'; payload: { threadId: string; message: ThreadMessage } }
  | { type: 'SET_THREAD_MESSAGES'; payload: { threadId: string; messages: ThreadMessage[] } }
  // Tree actions
  | { type: 'SET_PAGE_TREE'; payload: TreeItem[] }
  | { type: 'TOGGLE_FOLDER'; payload: string }
  // Branch actions (for diff view only - no actual checkout)
  | { type: 'SET_CURRENT_BRANCH'; payload: string }
  | { type: 'SET_BRANCH_VIEW_MODE'; payload: 'preview' | 'diff' | 'history' }
  | { type: 'UPDATE_CURRENT_PAGE_CONTENT'; payload: string }
  // Refresh trigger
  | { type: 'INCREMENT_PAGE_UPDATE_COUNTER' }
  // Thread creation loading
  | { type: 'SET_CREATING_THREAD'; payload: boolean };

// Load persisted state from localStorage
const loadPersistedExpandedFolders = (): string[] => {
  try {
    const stored = localStorage.getItem('sviter:expandedFolders');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const loadPersistedCurrentPagePath = (): string | null => {
  try {
    return localStorage.getItem('sviter:currentPagePath');
  } catch {
    return null;
  }
};

const initialState: AppState = {
  pages: [],
  currentPage: null,
  viewMode: 'view',
  isLoading: false,
  error: null,
  isConnected: false,
  connectionStatus: 'disconnected',
  centerPanelMode: 'page',
  selectedBranchForDiff: null,
  // Thread state
  threads: [],
  selectedThreadId: null,  // null = assistant mode
  assistantThreadId: null,  // Set when backend sends thread_selected with type=assistant
  threadMessages: {},
  // Tree state
  pageTree: [],
  expandedFolders: loadPersistedExpandedFolders(),
  // Branch state (for diff view - no actual checkout)
  currentBranch: 'main',
  branchViewMode: 'preview',
  // Refresh trigger for real-time updates
  pageUpdateCounter: 0,
  // Thread creation loading state
  isCreatingThread: false
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PAGES':
      return { ...state, pages: action.payload };

    case 'ADD_PAGE':
      return { ...state, pages: [...state.pages, action.payload] };

    case 'UPDATE_PAGE': {
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
    }

    case 'DELETE_PAGE': {
      const remainingPages = state.pages.filter(page => page.title !== action.payload);
      const newCurrentPage = state.currentPage?.title === action.payload
        ? (remainingPages.length > 0 ? remainingPages[0] : null)
        : state.currentPage;

      return {
        ...state,
        pages: remainingPages,
        currentPage: newCurrentPage
      };
    }

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

    case 'SET_CENTER_PANEL_MODE':
      return { ...state, centerPanelMode: action.payload };

    case 'SET_SELECTED_BRANCH_FOR_DIFF':
      return { ...state, selectedBranchForDiff: action.payload };

    // Thread reducers
    case 'SET_THREADS':
      return { ...state, threads: action.payload };

    case 'ADD_THREAD':
      // Don't add if already exists
      if (state.threads.some(t => t.id === action.payload.id)) {
        return state;
      }
      return {
        ...state,
        threads: [...state.threads, action.payload],
        threadMessages: {
          ...state.threadMessages,
          [action.payload.id]: []
        }
      };

    case 'UPDATE_THREAD':
      return {
        ...state,
        threads: state.threads.map(t =>
          t.id === action.payload.id
            ? { ...t, ...action.payload.updates }
            : t
        )
      };

    case 'REMOVE_THREAD': {
      const { [action.payload]: _, ...remainingMessages } = state.threadMessages;
      return {
        ...state,
        threads: state.threads.filter(t => t.id !== action.payload),
        threadMessages: remainingMessages,
        // If removed thread was selected, switch back to assistant
        selectedThreadId: state.selectedThreadId === action.payload ? state.assistantThreadId : state.selectedThreadId
      };
    }

    case 'SELECT_THREAD':
      return { ...state, selectedThreadId: action.payload };

    case 'SET_ASSISTANT_THREAD_ID':
      return { ...state, assistantThreadId: action.payload };

    case 'ADD_THREAD_MESSAGE': {
      const existingMessages = state.threadMessages[action.payload.threadId] || [];
      // Don't add duplicate system_prompt messages
      if (action.payload.message.role === 'system_prompt' &&
          existingMessages.some(m => m.role === 'system_prompt')) {
        return state;
      }
      return {
        ...state,
        threadMessages: {
          ...state.threadMessages,
          [action.payload.threadId]: [...existingMessages, action.payload.message]
        }
      };
    }

    case 'SET_THREAD_MESSAGES':
      return {
        ...state,
        threadMessages: {
          ...state.threadMessages,
          [action.payload.threadId]: action.payload.messages
        }
      };

    // Tree reducers
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

    // Branch reducer (for diff view only - no actual checkout)
    case 'SET_CURRENT_BRANCH':
      return { ...state, currentBranch: action.payload };

    case 'SET_BRANCH_VIEW_MODE':
      return { ...state, branchViewMode: action.payload };

    case 'UPDATE_CURRENT_PAGE_CONTENT':
      if (!state.currentPage) return state;
      return {
        ...state,
        currentPage: { ...state.currentPage, content: action.payload }
      };

    case 'INCREMENT_PAGE_UPDATE_COUNTER':
      return { ...state, pageUpdateCounter: state.pageUpdateCounter + 1 };

    case 'SET_CREATING_THREAD':
      return { ...state, isCreatingThread: action.payload };

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
    deletePage: (path: string) => Promise<void>;
    setCurrentPage: (page: Page | null) => Promise<void>;
    setCurrentPageDirect: (page: Page | null) => void;
    setViewMode: (mode: ViewMode) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    createPage: (title: string, content?: string) => Promise<void>;
    setCenterPanelMode: (mode: 'page' | 'branch-diff') => void;
    setSelectedBranchForDiff: (branch: string | null) => void;
    viewBranchDiff: (branch: string) => void;
    closeBranchDiff: () => void;
    // Thread actions
    selectThread: (threadId: string | null) => void;
    acceptThread: (threadId: string) => void;
    addThreadMessage: (threadId: string, role: ThreadMessage['role'], content: string) => void;
    setCreatingThread: (isCreating: boolean) => void;
    // Tree actions
    loadPageTree: () => Promise<void>;
    toggleFolder: (folderId: string) => void;
    moveItem: (sourcePath: string, targetParentPath: string | null, newOrder: number) => Promise<void>;
    createFolder: (name: string, parentPath?: string) => Promise<void>;
    deleteFolder: (path: string) => Promise<void>;
    // Branch actions
    refreshBranches: () => Promise<void>;
    checkoutBranch: (branch: string) => Promise<void>;
    setBranchViewMode: (mode: 'preview' | 'diff' | 'history') => void;
  };
  websocket: {
    sendMessage: (message: unknown) => void;
    sendChatMessage: (content: string) => void;
    onMessage: (handler: (message: WebSocketMessage) => void) => () => void;
    lastMessage: WebSocketMessage | null;
  };
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId, user, isLoading: isAuthLoading } = useAuth();
  const [state, dispatch] = useReducer(appReducer, initialState);
  const wsService = useRef<WebSocketService | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const messageHandlers = useRef<Set<(message: WebSocketMessage) => void>>(new Set());
  const reloadFunctionsRef = useRef<{ loadPages: () => void; loadTree: () => void; refreshCurrentPage: (title: string) => void; forceRefreshCurrentPage: () => void } | null>(null);
  const currentPageRef = useRef<Page | null>(null);
  const pagesRef = useRef<Page[]>([]);
  const pageTreeRef = useRef<TreeItem[]>([]);
  const threadsRef = useRef<Thread[]>([]);
  const currentBranchRef = useRef<string>('main');
  const selectedBranchForDiffRef = useRef<string | null>(null);
  const assistantThreadIdRef = useRef<string | null>(null);
  const selectedThreadIdRef = useRef<string | null>(null);

  // Guards to prevent concurrent loads
  const isLoadingPagesRef = useRef(false);
  const isLoadingTreeRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    currentPageRef.current = state.currentPage;
  }, [state.currentPage]);

  useEffect(() => {
    pagesRef.current = state.pages;
  }, [state.pages]);

  useEffect(() => {
    pageTreeRef.current = state.pageTree;
  }, [state.pageTree]);

  useEffect(() => {
    threadsRef.current = state.threads;
  }, [state.threads]);

  useEffect(() => {
    currentBranchRef.current = state.currentBranch;
  }, [state.currentBranch]);

  useEffect(() => {
    selectedBranchForDiffRef.current = state.selectedBranchForDiff;
  }, [state.selectedBranchForDiff]);

  useEffect(() => {
    assistantThreadIdRef.current = state.assistantThreadId;
  }, [state.assistantThreadId]);

  useEffect(() => {
    selectedThreadIdRef.current = state.selectedThreadId;
  }, [state.selectedThreadId]);

  // Initialize WebSocket service - wait for auth to complete
  useEffect(() => {
    // Don't connect until we have a userId
    if (isAuthLoading || !userId) {
      return;
    }

    wsService.current = createWebSocketService(userId);

    const statusUnsubscribe = wsService.current.onStatusChange((status) => {
      console.log('🔄 Connection status changed:', status);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: status });
    });

    const messageUnsubscribe = wsService.current.onMessage((message) => {
      setLastMessage(message);

      // Debug: Log all message types to track pages_content_changed
      if (message.type === 'pages_content_changed' || message.type === 'pages_changed') {
        console.log('📢 Received message:', message.type, message);
      }

      // Handle thread-specific messages
      if (message.type === 'thread_created') {
        console.log('📢 thread_created:', message.thread);
        dispatch({ type: 'ADD_THREAD', payload: message.thread });
        if (message.thread?.type === 'worker') {
          toast.info(`Thread started: ${message.thread.name}`, { description: message.thread.goal });
        }
      } else if (message.type === 'thread_status' && message.thread_id && message.status) {
        dispatch({
          type: 'UPDATE_THREAD',
          payload: {
            id: message.thread_id,
            updates: { status: message.status as ThreadStatus }
          }
        });
        // Toast for important status changes
        if (message.status === 'need_help') {
          toast.info(`Agent needs help`, { description: message.message || 'Waiting for your input' });
        } else if (message.status === 'review') {
          toast.success(`Agent ready for review`, { description: message.message || 'Changes are ready to be reviewed' });
        }
      } else if (message.type === 'thread_updated' && message.thread_id) {
        // Handle thread updates (status, name, branch, participants, etc.)
        const updates: Partial<Thread> = {};
        if (message.status) updates.status = message.status as ThreadStatus;
        if (message.name) updates.name = message.name;
        if (message.branch) updates.branch = message.branch as string;
        if (message.participants) updates.participants = message.participants as string[];
        if (Object.keys(updates).length > 0) {
          dispatch({
            type: 'UPDATE_THREAD',
            payload: { id: message.thread_id, updates }
          });
          // If this is the selected thread and branch changed, update the diff view
          if (message.branch && message.thread_id === selectedThreadIdRef.current) {
            dispatch({ type: 'SET_CURRENT_BRANCH', payload: message.branch as string });
            dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: message.branch as string });
          }
        }
      } else if (message.type === 'thread_deleted' && message.thread_id) {
        dispatch({ type: 'REMOVE_THREAD', payload: message.thread_id });
      } else if (message.type === 'thread_list' && message.threads) {
        dispatch({ type: 'SET_THREADS', payload: message.threads as Thread[] });
      } else if (message.type === 'notification') {
        // Show toast notification (e.g., when mentioned)
        const title = (message as { title?: string }).title;
        const description = (message as { message?: string }).message;
        toast.info(title || 'Notification', { description });
      } else if (message.type === 'collab_room_change') {
        // When collab room changes, request fresh thread list to update merge_blocked status
        wsService.current?.send({ type: 'get_thread_list' });
      } else if (message.type === 'thread_selected') {
        console.log('📢 thread_selected:', message.thread_id, message.thread_type, message.thread);
        // Clear thread creation loading state
        dispatch({ type: 'SET_CREATING_THREAD', payload: false });
        // Set assistant thread ID if this is the assistant thread
        if (message.thread_type === 'assistant' && message.thread_id) {
          dispatch({ type: 'SET_ASSISTANT_THREAD_ID', payload: message.thread_id });
        }
        // Use actual thread_id for all cases (including assistant)
        dispatch({ type: 'SELECT_THREAD', payload: message.thread_id ?? null });
        // Update thread data if provided (includes fresh merge_blocked status)
        if (message.thread && message.thread_id) {
          dispatch({
            type: 'UPDATE_THREAD',
            payload: {
              id: message.thread_id,
              updates: message.thread as Partial<Thread>
            }
          });
        }
        // Only replace messages if history has content (avoid wiping out system_prompt)
        if (message.history && message.history.length > 0 && message.thread_id) {
          dispatch({
            type: 'SET_THREAD_MESSAGES',
            payload: {
              threadId: message.thread_id,
              messages: message.history as ThreadMessage[]
            }
          });
        }
        // Update center panel for worker threads (e.g., after spawning)
        if (message.thread_type === 'worker' && message.thread) {
          const thread = message.thread as Thread;
          if (thread.branch) {
            dispatch({ type: 'SET_CURRENT_BRANCH', payload: thread.branch });
            dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: thread.branch });
            dispatch({ type: 'SET_CENTER_PANEL_MODE', payload: 'branch-diff' });
          }
        } else if (message.thread_type === 'assistant') {
          // Assistant selected - back to page view
          dispatch({ type: 'SET_CURRENT_BRANCH', payload: 'main' });
          dispatch({ type: 'SET_CENTER_PANEL_MODE', payload: 'page' });
          dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: null });
        }
      } else if (message.type === 'thread_message' && message.thread_id && message.role && message.content !== undefined) {
        // Add message to thread's conversation
        const threadId = message.thread_id;
        const role = message.role as ThreadMessage['role'];
        const content = message.content;
        const threadMessage: ThreadMessage = {
          id: Date.now().toString(),
          role,
          content,
          timestamp: new Date().toISOString(),
          tool_name: message.tool_name,
          tool_args: message.tool_args,
          user_id: message.user_id,  // Who sent this message (for collaborative threads)
          user_name: message.user_name  // Display name for proper initials
        };
        dispatch({
          type: 'ADD_THREAD_MESSAGE',
          payload: {
            threadId,
            message: threadMessage
          }
        });
      } else if (message.type === 'system_prompt' && message.thread_id && message.content !== undefined) {
        // Store system prompt in thread messages
        const content = message.content;
        const systemPromptMessage: ThreadMessage = {
          id: `sysprompt_${Date.now()}`,
          role: 'system_prompt',
          content,
          timestamp: new Date().toISOString()
        };
        dispatch({
          type: 'ADD_THREAD_MESSAGE',
          payload: {
            threadId: message.thread_id,
            message: systemPromptMessage
          }
        });
      } else if (message.type === 'tool_call' && message.thread_id) {
        // Store tool call in thread messages
        const toolCallMessage: ThreadMessage = {
          id: `tool_${Date.now()}`,
          role: 'tool_call',
          content: message.result || '',
          timestamp: new Date().toISOString(),
          tool_name: message.tool_name,
          tool_args: message.arguments
        };
        dispatch({
          type: 'ADD_THREAD_MESSAGE',
          payload: {
            threadId: message.thread_id,
            message: toolCallMessage
          }
        });
      } else if (message.type === 'page_updated') {
        // Reload pages and tree when content changes
        if (reloadFunctionsRef.current) {
          reloadFunctionsRef.current.loadPages();
          reloadFunctionsRef.current.loadTree();
          // Also refresh current page if it was the one updated
          // Note: message.title comes from the backend, NOT message.content (which is the tool result)
          if (message.title) {
            reloadFunctionsRef.current.refreshCurrentPage(message.title);
          }
        }
        // Trigger diff view refresh
        dispatch({ type: 'INCREMENT_PAGE_UPDATE_COUNTER' });
      } else if (message.type === 'pages_changed') {
        // Reload pages and tree when content changes (e.g., after thread merge)
        if (reloadFunctionsRef.current) {
          reloadFunctionsRef.current.loadPages();
          reloadFunctionsRef.current.loadTree();
          // Force refresh current page to show merged content
          reloadFunctionsRef.current.forceRefreshCurrentPage();
        }
        // Trigger diff view refresh for thread change views
        dispatch({ type: 'INCREMENT_PAGE_UPDATE_COUNTER' });
      } else if (message.type === 'pages_content_changed') {
        // Pages were changed outside of collaborative editing (e.g., thread merge)
        // Invalidate collab sessions so they reconnect with fresh content
        const pages = (message as { pages?: string[] }).pages || [];
        if (pages.length > 0) {
          console.log('Invalidating collab sessions for merged pages:', pages);
          invalidateSessions(pages);
        }
        // Reload pages and tree, wait for fresh content, then trigger re-render
        (async () => {
          if (reloadFunctionsRef.current) {
            reloadFunctionsRef.current.loadPages();
            reloadFunctionsRef.current.loadTree();
            // Wait for fresh content before triggering editor remount
            await reloadFunctionsRef.current.forceRefreshCurrentPage();
          }
          // Now increment counter to remount editors with fresh content
          dispatch({ type: 'INCREMENT_PAGE_UPDATE_COUNTER' });
        })();
      }

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
  }, [userId, isAuthLoading]);

  // Helper to compare two pages arrays (order-independent comparison)
  // Pages are compared as sets since backend sorts by updated_at which changes order
  const arePagesEqual = useCallback((a: Page[], b: Page[]): boolean => {
    if (a.length !== b.length) return false;
    // Create a Set of page identifiers from array a
    const aSet = new Set(a.map(p => `${p.title}|${p.path}`));
    // Check if all pages in b exist in aSet
    for (const page of b) {
      if (!aSet.has(`${page.title}|${page.path}`)) return false;
    }
    return true;
  }, []);

  // Helper to compare two tree arrays (order-independent comparison)
  // Trees are compared as sets since order may change based on updates
  const areTreesEqual = useCallback((a: TreeItem[], b: TreeItem[]): boolean => {
    if (a.length !== b.length) return false;

    // Create a map of tree items from array a by their id
    const aMap = new Map<string, TreeItem>();
    for (const item of a) {
      aMap.set(item.id, item);
    }

    // Check if all items in b exist in aMap with matching properties
    for (const bItem of b) {
      const aItem = aMap.get(bItem.id);
      if (!aItem) return false;
      if (aItem.title !== bItem.title || aItem.path !== bItem.path) return false;

      // Recursively compare children
      const aChildren = aItem.children || [];
      const bChildren = bItem.children || [];
      if (!areTreesEqual(aChildren, bChildren)) return false;
    }
    return true;
  }, []);

  // Background-safe loadPages that doesn't dispatch loading state
  // This prevents infinite re-render loops when called from WebSocket handlers
  const loadPages = useCallback(async (showLoading = false) => {
    // Guard against concurrent loads
    if (isLoadingPagesRef.current) {
      console.log('loadPages: skipping - already loading');
      return;
    }
    isLoadingPagesRef.current = true;

    if (showLoading) {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/pages`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const backendPages: Page[] = data.pages;

      // Only dispatch SET_PAGES if pages actually changed to avoid unnecessary re-renders
      if (!arePagesEqual(pagesRef.current, backendPages)) {
        pagesRef.current = backendPages; // Update ref immediately to prevent duplicate dispatches
        dispatch({ type: 'SET_PAGES', payload: backendPages });
      }

      // Only fetch full page content if no page is currently selected
      // When a page is already selected, don't refetch to avoid unnecessary re-renders
      // The page content will be updated when the user navigates or refreshes
      if (!currentPageRef.current && backendPages.length > 0) {
        try {
          // Try to find Home.md first, otherwise use first page
          const homePage = backendPages.find(p => p.path === 'Home.md' || p.title === 'Home.md');
          const defaultPage = homePage || backendPages[0];
          const pageResponse = await fetch(`${getApiUrl()}/api/pages/${encodeURIComponent(defaultPage.path)}`);
          if (pageResponse.ok) {
            const fullPage = await pageResponse.json();
            currentPageRef.current = fullPage; // Update ref immediately to prevent duplicate dispatches
            dispatch({ type: 'SET_CURRENT_PAGE', payload: fullPage });
          }
        } catch {
          // If we can't load the page, just keep the current one
        }
      }
    } catch (err) {
      if (showLoading) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to load pages' });
      }
      console.error('Error loading pages:', err);
    } finally {
      isLoadingPagesRef.current = false;
      if (showLoading) {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
  }, [arePagesEqual]); // Uses refs for state access

  // Refresh current page content from API (for when page_updated is received)
  const refreshCurrentPage = useCallback(async (pageTitle: string) => {
    // Only refresh if this is the currently selected page
    // Compare both title and path since backend may send either format
    if (!currentPageRef.current ||
        (currentPageRef.current.title !== pageTitle && currentPageRef.current.path !== pageTitle)) {
      return;
    }

    try {
      // Use branch-specific endpoint if viewing a thread branch
      const branchRef = selectedBranchForDiffRef.current;
      // Use path for API call since that's what the endpoints expect
      const pagePath = currentPageRef.current.path;
      const url = branchRef
        ? `${getApiUrl()}/api/pages/${encodeURIComponent(pagePath)}/at-ref?ref=${encodeURIComponent(branchRef)}`
        : `${getApiUrl()}/api/pages/${encodeURIComponent(pagePath)}`;

      const pageResponse = await fetch(url);
      if (pageResponse.ok) {
        const data = await pageResponse.json();
        // /at-ref returns {content, exists}, regular endpoint returns full page
        const newContent = data.content || '';
        const currentContent = currentPageRef.current?.content || '';

        if (currentContent !== newContent) {
          // Update the current page with new content
          const updatedPage = branchRef
            ? { ...currentPageRef.current, content: newContent }
            : data; // Full page object from main branch endpoint
          currentPageRef.current = updatedPage;
          dispatch({ type: 'SET_CURRENT_PAGE', payload: updatedPage });
        }
      }
    } catch (err) {
      console.error('Error refreshing current page:', err);
    }
  }, []);

  // Force refresh current page content (for after merges when content may have changed)
  const forceRefreshCurrentPage = useCallback(async () => {
    if (!currentPageRef.current) {
      return;
    }

    try {
      const pageResponse = await fetch(`${getApiUrl()}/api/pages/${encodeURIComponent(currentPageRef.current.path)}`);
      if (pageResponse.ok) {
        const fullPage = await pageResponse.json();
        currentPageRef.current = fullPage;
        dispatch({ type: 'SET_CURRENT_PAGE', payload: fullPage });
      }
    } catch (err) {
      console.error('Error force refreshing current page:', err);
    }
  }, []);

  // Update ref with reload functions
  useEffect(() => {
    reloadFunctionsRef.current = {
      loadPages,
      loadTree: async () => {
        // Guard against concurrent loads
        if (isLoadingTreeRef.current) {
          console.log('loadTree: skipping - already loading');
          return;
        }
        isLoadingTreeRef.current = true;

        try {
          // When reviewing a thread, load tree from its branch to show new/deleted pages
          const ref = selectedBranchForDiffRef.current || undefined;
          const tree = await treeApi.getTree(ref);
          // Only dispatch if tree actually changed to avoid unnecessary re-renders
          if (!areTreesEqual(pageTreeRef.current, tree)) {
            pageTreeRef.current = tree; // Update ref immediately to prevent duplicate dispatches
            dispatch({ type: 'SET_PAGE_TREE', payload: tree });
          }
        } finally {
          isLoadingTreeRef.current = false;
        }
      },
      refreshCurrentPage,
      forceRefreshCurrentPage
    };
  }, [loadPages, areTreesEqual, refreshCurrentPage, forceRefreshCurrentPage]);


  // Handle page updates from lastMessage
  // Note: page_updated and pages_changed are handled directly in the WebSocket handler above
  // to avoid duplicate loadPages() calls. Only handle other message types here.
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'page_update') {
      // Use reloadFunctionsRef to avoid dependency on loadPages
      reloadFunctionsRef.current?.loadPages();
    }
    // page_updated is handled in the direct WebSocket handler
  }, [lastMessage]);

  // Load pages on init (with loading indicator)
  useEffect(() => {
    loadPages(true);
  }, []); // Run only once on mount

  // Persist expanded folders to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('sviter:expandedFolders', JSON.stringify(state.expandedFolders));
    } catch (err) {
      console.error('Failed to persist expanded folders:', err);
    }
  }, [state.expandedFolders]);

  // Persist current page path to localStorage whenever it changes
  useEffect(() => {
    try {
      if (state.currentPage) {
        localStorage.setItem('sviter:currentPagePath', state.currentPage.path);
      } else {
        localStorage.removeItem('sviter:currentPagePath');
      }
    } catch (err) {
      console.error('Failed to persist current page path:', err);
    }
  }, [state.currentPage]);

  // Load persisted current page on startup (after pages are loaded)
  const hasLoadedPersistedPageRef = useRef(false);
  useEffect(() => {
    // Only run once when pages are first loaded
    if (hasLoadedPersistedPageRef.current || state.pages.length === 0 || state.currentPage) {
      return;
    }

    const persistedPagePath = loadPersistedCurrentPagePath();
    if (persistedPagePath) {
      // Find the persisted page in the loaded pages
      const persistedPage = state.pages.find(p => p.path === persistedPagePath);
      if (persistedPage) {
        hasLoadedPersistedPageRef.current = true;
        // Load the full page content asynchronously
        (async () => {
          try {
            const response = await fetch(`${getApiUrl()}/api/pages/${encodeURIComponent(persistedPage.path)}`);
            if (response.ok) {
              const fullPage = await response.json();
              dispatch({ type: 'SET_CURRENT_PAGE', payload: fullPage });
            }
          } catch (err) {
            console.error('Failed to load persisted page:', err);
          }
        })();
      }
    }
  }, [state.pages.length, state.currentPage]); // Run when pages are first loaded

  // Reload tree when branch for diff changes (entering/exiting review mode)
  useEffect(() => {
    // Use the ref callback to load tree with the new branch
    reloadFunctionsRef.current?.loadTree();
  }, [state.selectedBranchForDiff]);

  // WebSocket functions
  const sendMessage = useCallback((message: unknown) => {
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
        const response = await fetch(`${getApiUrl()}/api/pages/${encodeURIComponent(title)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
    deletePage: async (path: string) => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const response = await fetch(`${getApiUrl()}/api/pages/${encodeURIComponent(path)}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        dispatch({ type: 'DELETE_PAGE', payload: path });
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
      } catch (err) {
        console.error('Error deleting page:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to delete page');
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    setCurrentPage: async (page: Page | null) => {
      if (!page) {
        dispatch({ type: 'SET_CURRENT_PAGE', payload: null });
        return;
      }

      // Images don't need content loading - they're served via /api/assets/
      const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(page.path);
      if (isImage) {
        dispatch({ type: 'SET_CURRENT_PAGE', payload: { ...page, file_type: 'image' as const } });
        return;
      }

      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        // When reviewing a thread, load page from thread's branch
        const branchRef = selectedBranchForDiffRef.current;
        const url = branchRef
          ? `${getApiUrl()}/api/pages/${encodeURIComponent(page.path)}/at-ref?ref=${encodeURIComponent(branchRef)}`
          : `${getApiUrl()}/api/pages/${encodeURIComponent(page.path)}`;

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        // at-ref endpoint returns { content, exists }, regular endpoint returns full page
        const fullPage = branchRef
          ? { ...page, content: data.content || '' }
          : data;
        dispatch({ type: 'SET_CURRENT_PAGE', payload: fullPage });
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: 'Failed to load page content' });
        console.error('Error loading page:', err);
        dispatch({ type: 'SET_CURRENT_PAGE', payload: page });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },
    setCurrentPageDirect: (page: Page | null) => {
      dispatch({ type: 'SET_CURRENT_PAGE', payload: page });
    },
    setViewMode: (mode: ViewMode) => dispatch({ type: 'SET_VIEW_MODE', payload: mode }),
    setLoading: (loading: boolean) => dispatch({ type: 'SET_LOADING', payload: loading }),
    setError: (error: string | null) => dispatch({ type: 'SET_ERROR', payload: error }),

    createPage: async (title: string, content = '') => {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      try {
        const response = await fetch(`${getApiUrl()}/api/pages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            title,
            content,
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
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
      } catch (err) {
        console.error('Error creating page:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to create page');
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    },

    // Panel actions
    setCenterPanelMode: (mode: 'page' | 'branch-diff') => dispatch({ type: 'SET_CENTER_PANEL_MODE', payload: mode }),
    setSelectedBranchForDiff: (branch: string | null) => dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: branch }),
    viewBranchDiff: (branch: string) => {
      dispatch({ type: 'SET_CURRENT_BRANCH', payload: branch });
      dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: branch });
      dispatch({ type: 'SET_CENTER_PANEL_MODE', payload: 'branch-diff' });
    },
    closeBranchDiff: () => {
      dispatch({ type: 'SET_CURRENT_BRANCH', payload: 'main' });
      dispatch({ type: 'SET_CENTER_PANEL_MODE', payload: 'page' });
      dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: null });
    },

    // Thread actions
    selectThread: async (threadId: string | null) => {
      wsService.current?.send({
        type: 'select_thread',
        thread_id: threadId
      });

      // With worktrees, threads run in isolated directories.
      // No git checkout needed - diff views use git diff API with branch refs.
      if (threadId) {
        const thread = threadsRef.current.find(t => t.id === threadId);
        if (thread?.branch) {
          // Auto-show diff view when selecting a thread
          dispatch({ type: 'SET_CURRENT_BRANCH', payload: thread.branch });
          dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: thread.branch });
          dispatch({ type: 'SET_CENTER_PANEL_MODE', payload: 'branch-diff' });
        }
      } else {
        // Switching to assistant - update immediately (don't wait for backend)
        // Use assistantThreadId (or null if not set yet)
        dispatch({ type: 'SELECT_THREAD', payload: assistantThreadIdRef.current });
        dispatch({ type: 'SET_CURRENT_BRANCH', payload: 'main' });
        dispatch({ type: 'SET_CENTER_PANEL_MODE', payload: 'page' });
        dispatch({ type: 'SET_SELECTED_BRANCH_FOR_DIFF', payload: null });
      }
    },
    acceptThread: (threadId: string) => {
      wsService.current?.send({
        type: 'accept_thread',
        thread_id: threadId
      });
    },
    addThreadMessage: (threadId: string, role: ThreadMessage['role'], content: string) => {
      const message: ThreadMessage = {
        id: `user_${Date.now()}`,
        role,
        content,
        timestamp: new Date().toISOString(),
        user_id: role === 'user' ? userId || undefined : undefined,
        user_name: role === 'user' ? user?.name || undefined : undefined
      };
      dispatch({
        type: 'ADD_THREAD_MESSAGE',
        payload: { threadId, message }
      });
    },
    setCreatingThread: (isCreating: boolean) => {
      dispatch({ type: 'SET_CREATING_THREAD', payload: isCreating });
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
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
        const response = await fetch(`${getApiUrl()}/api/pages`);
        if (response.ok) {
          const data = await response.json();
          dispatch({ type: 'SET_PAGES', payload: data.pages });
        }
      } catch (err) {
        console.error('Failed to move item:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to move item');
        try {
          const tree = await treeApi.getTree();
          dispatch({ type: 'SET_PAGE_TREE', payload: tree });
        } catch {
          // ignore
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
        toast.error(err instanceof Error ? err.message : 'Failed to create folder');
      }
    },

    deleteFolder: async (path: string) => {
      try {
        await treeApi.deleteFolder(path);
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
      } catch (err) {
        console.error('Failed to delete folder:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to delete folder');
      }
    },

    // Branch actions
    refreshBranches: async () => {
      // Just fetch to verify endpoint is accessible - branch list is managed elsewhere
      try {
        await fetch(`${getApiUrl()}/api/git/branches`);
      } catch (err) {
        console.error('Failed to refresh branches:', err);
      }
    },

    checkoutBranch: async (branch: string) => {
      try {
        const response = await fetch(`${getApiUrl()}/api/git/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch }),
        });
        if (!response.ok) {
          throw new Error(`Failed to checkout branch: ${response.statusText}`);
        }
        dispatch({ type: 'SET_CURRENT_BRANCH', payload: branch });
        // Reload pages and tree after checkout
        const pagesResponse = await fetch(`${getApiUrl()}/api/pages`);
        if (pagesResponse.ok) {
          const data = await pagesResponse.json();
          dispatch({ type: 'SET_PAGES', payload: data.pages });
        }
        const tree = await treeApi.getTree();
        dispatch({ type: 'SET_PAGE_TREE', payload: tree });
      } catch (err) {
        console.error('Failed to checkout branch:', err);
        dispatch({ type: 'SET_ERROR', payload: 'Failed to checkout branch' });
      }
    },

    setBranchViewMode: (mode: 'preview' | 'diff' | 'history') => {
      dispatch({ type: 'SET_BRANCH_VIEW_MODE', payload: mode });
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
