/**
 * Hook for collaborative text page editing using Yjs.
 * Provides access to any text file content with real-time sync.
 * Works with .md, .txt, .json, .tsx, and any other text files.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import { stringToColor, getInitials, getDisplayName } from '../utils/colors';
import { getWsUrl, getApiUrl } from '../utils/url';
import { updatePage } from '../services/api';

// Debounce delay for auto-save (milliseconds)
const SAVE_DEBOUNCE_MS = 2000;

export type SaveStatus = 'saved' | 'saving' | 'dirty';

export interface UsePageResult {
  /** Current text content of the file */
  content: string;
  /** Update the content */
  setContent: (content: string) => void;
  /** Whether the content has been loaded */
  isLoaded: boolean;
  /** Whether the content is currently syncing */
  isSyncing: boolean;
  /** Connection status */
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  /** Save status for the content */
  saveStatus: SaveStatus;
}

// Save status listeners per page
type SaveStatusListener = (status: SaveStatus) => void;
const saveStatusListeners = new Map<string, Set<SaveStatusListener>>();

function notifySaveStatus(pageId: string, status: SaveStatus): void {
  const listeners = saveStatusListeners.get(pageId);
  if (listeners) {
    listeners.forEach(listener => listener(status));
  }
}

// Active text sessions by page path
const activeTextSessions = new Map<string, {
  doc: Y.Doc;
  provider: WebsocketProvider;
  yText: Y.Text;
  saveTimer: ReturnType<typeof setTimeout> | null;
  lastSavedContent: string;
  isInitialLoad: boolean;
  saveStatus: SaveStatus;
}>();

/**
 * Save text content to backend.
 */
async function saveTextContent(pageId: string): Promise<void> {
  const session = activeTextSessions.get(pageId);
  if (!session) return;

  const content = session.yText.toString();

  // Skip if content hasn't changed
  if (content === session.lastSavedContent) {
    session.saveStatus = 'saved';
    notifySaveStatus(pageId, 'saved');
    return;
  }

  session.saveStatus = 'saving';
  notifySaveStatus(pageId, 'saving');

  try {
    await updatePage(pageId, {
      content,
      author: 'collaborative',
    });
    session.lastSavedContent = content;
    session.saveStatus = 'saved';
    notifySaveStatus(pageId, 'saved');
    console.log(`Saved text content: ${pageId}`);
  } catch (error) {
    console.error(`Failed to save text ${pageId}:`, error);
    // Revert to dirty so it will retry
    session.saveStatus = 'dirty';
    notifySaveStatus(pageId, 'dirty');
  }
}

/**
 * Schedule a debounced save for text content.
 */
function scheduleSaveText(pageId: string): void {
  const session = activeTextSessions.get(pageId);
  if (!session || session.isInitialLoad) return;

  // Mark as dirty
  session.saveStatus = 'dirty';
  notifySaveStatus(pageId, 'dirty');

  // Clear existing timer
  if (session.saveTimer) {
    clearTimeout(session.saveTimer);
  }

  // Schedule new save
  session.saveTimer = setTimeout(() => {
    saveTextContent(pageId);
    session.saveTimer = null;
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Ephemeral hook for viewing page content from a branch.
 * Fetches content from branch, allows local mutations (not saved).
 * Used in thread review View mode.
 */
function usePageEphemeral(
  pageId: string,
  branchRef: string,
  refreshTrigger?: number
): UsePageResult {
  const [content, setContentState] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const fetchedRef = useRef<string>('');

  // Fetch content from branch
  useEffect(() => {
    if (!pageId || !branchRef) {
      return;
    }

    const fetchKey = `${pageId}@${branchRef}@${refreshTrigger ?? 0}`;

    // Skip if already fetched this exact version
    if (fetchedRef.current === fetchKey && isLoaded) {
      return;
    }

    const fetchData = async () => {
      try {
        const url = `${getApiUrl()}/api/pages/${encodeURIComponent(pageId)}/at-ref?ref=${encodeURIComponent(branchRef)}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setContentState(data.content || '');
          fetchedRef.current = fetchKey;
        }
      } catch (err) {
        console.error('Failed to fetch page from branch:', err);
      }
      setIsLoaded(true);
    };

    fetchData();
  }, [pageId, branchRef, refreshTrigger, isLoaded]);

  // Local-only setContent (ephemeral - not saved)
  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
  }, []);

  return {
    content,
    setContent,
    isLoaded,
    isSyncing: false,
    connectionStatus: 'connected',
    saveStatus: 'saved', // Always "saved" since we don't save
  };
}

/**
 * Hook for collaborative text page editing.
 * Syncs text content via Yjs Y.Text.
 *
 * @param pageId - The path to the text file (e.g., "notes.md", "config.json")
 * @param refreshTrigger - Optional refresh counter for ephemeral mode sync
 */
export function usePage(
  pageId: string,
  refreshTrigger?: number
): UsePageResult {
  const { userId, user } = useAuth();
  const { viewingBranch, ephemeral } = useBranch();

  // If viewing a branch in ephemeral mode, use the ephemeral hook
  const ephemeralResult = usePageEphemeral(
    viewingBranch && ephemeral ? pageId : '',
    viewingBranch || '',
    refreshTrigger
  );

  // Return ephemeral result if in ephemeral mode
  if (viewingBranch && ephemeral) {
    return ephemeralResult;
  }

  // Otherwise continue with normal Yjs-based hook
  const [content, setContentState] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [session, setSession] = useState<typeof activeTextSessions extends Map<string, infer V> ? V : never>();

  useEffect(() => {
    if (!userId || !pageId) {
      return;
    }

    // Check for existing session
    let existingSession = activeTextSessions.get(pageId);
    let isNewSession = false;

    if (!existingSession) {
      isNewSession = true;
      // Create new Yjs document and provider
      const doc = new Y.Doc();
      const wsUrl = getWsUrl('/ws/collab');

      const provider = new WebsocketProvider(wsUrl, pageId, doc, {
        connect: true,
        params: { userId, clientId: userId },
      });

      // Set up awareness
      provider.awareness.setLocalStateField('user', {
        id: userId,
        name: user?.name || getDisplayName(userId),
        color: stringToColor(userId),
        initials: getInitials(userId, user?.name),
      });

      // Get Y.Text for content
      const yText = doc.getText('content');

      existingSession = {
        doc,
        provider,
        yText,
        saveTimer: null,
        lastSavedContent: '',
        isInitialLoad: true,
        saveStatus: 'saved' as SaveStatus,
      };
      activeTextSessions.set(pageId, existingSession);

      // Set up auto-save observer
      yText.observe(() => {
        scheduleSaveText(pageId);
      });

      // Mark initial load complete after sync settles
      provider.on('sync', (synced: boolean) => {
        if (synced) {
          setTimeout(() => {
            const session = activeTextSessions.get(pageId);
            if (session) {
              session.isInitialLoad = false;
              session.lastSavedContent = session.yText.toString();
              console.log(`Text initial load complete: ${pageId}`);
            }
          }, 500);
        }
      });
    }

    const { provider, yText, doc } = existingSession;

    // Handle connection status
    const handleStatus = (event: { status: string }) => {
      setConnectionStatus(
        event.status === 'connected' ? 'connected' :
        event.status === 'connecting' ? 'connecting' :
        'disconnected'
      );
    };
    provider.on('status', handleStatus);

    // Handle sync - fetch and initialize content if empty
    const handleSync = async (synced: boolean) => {
      if (synced) {
        setIsSyncing(false);

        // If Y.Text is empty, fetch content from server and initialize
        if (yText.length === 0) {
          try {
            const response = await fetch(`${getApiUrl()}/api/pages/${encodeURIComponent(pageId)}`);
            if (response.ok) {
              const page = await response.json();
              if (page.content) {
                doc.transact(() => {
                  yText.insert(0, page.content);
                });
              }
            }
          } catch (err) {
            console.error('Failed to fetch text content:', err);
          }
        }

        setIsLoaded(true);
      }
    };
    provider.on('sync', handleSync);

    // If reusing an existing session that's already synced, mark as loaded immediately
    if (!isNewSession && provider.synced) {
      setIsLoaded(true);
      setConnectionStatus('connected');
    }

    setSession(existingSession);

    // Update content state when Y.Text changes
    const updateContent = () => {
      setContentState(existingSession!.yText.toString());
    };

    // Initial load
    updateContent();

    // Observe changes
    existingSession.yText.observe(updateContent);

    // Subscribe to save status changes
    if (!saveStatusListeners.has(pageId)) {
      saveStatusListeners.set(pageId, new Set());
    }
    const handleSaveStatus = (status: SaveStatus) => {
      setSaveStatus(status);
    };
    saveStatusListeners.get(pageId)!.add(handleSaveStatus);

    // Set initial save status from session
    setSaveStatus(existingSession.saveStatus);

    return () => {
      existingSession?.yText.unobserve(updateContent);
      provider.off('status', handleStatus);
      provider.off('sync', handleSync);
      saveStatusListeners.get(pageId)?.delete(handleSaveStatus);
    };
  }, [pageId, userId]);

  const setContent = useCallback((newContent: string) => {
    if (!session?.yText) return;

    session.doc.transact(() => {
      // Clear existing content and insert new
      session.yText.delete(0, session.yText.length);
      session.yText.insert(0, newContent);
    });
  }, [session]);

  return {
    content,
    setContent,
    isLoaded,
    isSyncing,
    connectionStatus,
    saveStatus,
  };
}

/**
 * Clean up a text session when navigating away.
 */
export function destroyTextSession(pageId: string): void {
  const session = activeTextSessions.get(pageId);
  if (session) {
    if (session.saveTimer) {
      clearTimeout(session.saveTimer);
    }
    session.provider.awareness.setLocalState(null);
    session.provider.disconnect();
    session.provider.destroy();
    session.doc.destroy();
    activeTextSessions.delete(pageId);
  }
}

/**
 * Check if a text session exists.
 */
export function hasTextSession(pageId: string): boolean {
  return activeTextSessions.has(pageId);
}
