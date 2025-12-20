/**
 * Collaborative editing service using Yjs and y-websocket.
 * Manages document synchronization and user awareness for real-time collaboration.
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { stringToColor, getInitials, getDisplayName } from '../utils/colors';
import { updatePage } from './api';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
export type SaveStatus = 'saved' | 'saving' | 'dirty';

export interface CollabUser {
  id: string;
  name: string;
  color: string;
  initials: string;
}

export interface CollabSession {
  doc: Y.Doc;
  provider: WebsocketProvider;
  pagePath: string;
  destroy: () => void;
}

type StatusHandler = (status: ConnectionStatus) => void;
type UsersHandler = (users: CollabUser[]) => void;
type SaveStatusHandler = (status: SaveStatus) => void;

// Debounce delay for auto-save (milliseconds)
const SAVE_DEBOUNCE_MS = 2000;

// Active sessions by page path
const activeSessions = new Map<string, CollabSession>();

// Status handler registrations for each session
const statusHandlers = new Map<string, Set<StatusHandler>>();
const usersHandlers = new Map<string, Set<UsersHandler>>();
const saveStatusHandlers = new Map<string, Set<SaveStatusHandler>>();

// Save state per session
interface SaveState {
  status: SaveStatus;
  lastSavedContent: string;
  saveTimer: ReturnType<typeof setTimeout> | null;
  isInitialLoad: boolean;
}
const saveStates = new Map<string, SaveState>();

/**
 * Notify all save status handlers for a page.
 */
function notifySaveStatus(pagePath: string, status: SaveStatus): void {
  const state = saveStates.get(pagePath);
  if (state) {
    state.status = status;
  }
  const handlers = saveStatusHandlers.get(pagePath);
  if (handlers) {
    handlers.forEach(handler => handler(status));
  }
}

/**
 * Save document content to backend.
 */
async function saveDocument(pagePath: string, pageTitle: string): Promise<void> {
  const session = activeSessions.get(pagePath);
  const state = saveStates.get(pagePath);
  if (!session || !state) return;

  const yText = session.doc.getText('content');
  const content = yText.toString();

  // Skip if content hasn't changed
  if (content === state.lastSavedContent) {
    notifySaveStatus(pagePath, 'saved');
    return;
  }

  notifySaveStatus(pagePath, 'saving');
  try {
    await updatePage(pageTitle, {
      content,
      author: 'collaborative',
    });
    state.lastSavedContent = content;
    notifySaveStatus(pagePath, 'saved');
    console.log(`Saved document: ${pagePath}`);
  } catch (error) {
    console.error(`Failed to save ${pagePath}:`, error);
    // Revert to dirty so it will retry
    notifySaveStatus(pagePath, 'dirty');
  }
}

/**
 * Schedule a debounced save for a page.
 */
function scheduleSave(pagePath: string, pageTitle: string): void {
  const state = saveStates.get(pagePath);
  if (!state || state.isInitialLoad) return;

  notifySaveStatus(pagePath, 'dirty');

  // Clear existing timer
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
  }

  // Schedule new save
  state.saveTimer = setTimeout(() => {
    saveDocument(pagePath, pageTitle);
    state.saveTimer = null;
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Create or get an existing collaborative editing session for a page.
 * Uses y-websocket to sync with the backend collaboration server.
 */
export function createCollabSession(
  pagePath: string,
  userId: string,
  onStatusChange?: StatusHandler,
  onUsersChange?: UsersHandler,
  onSaveStatusChange?: SaveStatusHandler,
  pageTitle?: string // Used for saving - defaults to pagePath
): CollabSession {
  const title = pageTitle || pagePath;

  // Register handlers
  if (onStatusChange) {
    if (!statusHandlers.has(pagePath)) {
      statusHandlers.set(pagePath, new Set());
    }
    statusHandlers.get(pagePath)!.add(onStatusChange);
  }
  if (onUsersChange) {
    if (!usersHandlers.has(pagePath)) {
      usersHandlers.set(pagePath, new Set());
    }
    usersHandlers.get(pagePath)!.add(onUsersChange);
  }
  if (onSaveStatusChange) {
    if (!saveStatusHandlers.has(pagePath)) {
      saveStatusHandlers.set(pagePath, new Set());
    }
    saveStatusHandlers.get(pagePath)!.add(onSaveStatusChange);
  }

  // Return existing session if already connected to this page
  const existing = activeSessions.get(pagePath);
  if (existing) {
    console.log(`Reusing existing collab session for: ${pagePath}`);
    // Immediately call handlers with current status
    if (onStatusChange) {
      const status = existing.provider.wsconnected ? 'connected' : 'connecting';
      onStatusChange(status);
    }
    if (onUsersChange) {
      const users: CollabUser[] = [];
      existing.provider.awareness.getStates().forEach((state, clientId) => {
        if (state.user && clientId !== existing.provider.awareness.clientID) {
          users.push(state.user as CollabUser);
        }
      });
      onUsersChange(users);
    }
    if (onSaveStatusChange) {
      const saveState = saveStates.get(pagePath);
      onSaveStatusChange(saveState?.status || 'saved');
    }
    return existing;
  }

  console.log(`Creating new collab session for: ${pagePath}`);

  // Clean up sessions for other pages
  cleanupOtherSessions(pagePath);

  // Create Yjs document
  const doc = new Y.Doc();

  // Connect to backend collaboration WebSocket
  // URL format: ws://localhost:8000/ws/collab/{clientId}/{pagePath}
  const wsUrl = `ws://localhost:8000/ws/collab`;
  const roomName = pagePath; // Use page path as room name

  const provider = new WebsocketProvider(wsUrl, roomName, doc, {
    connect: true,
    // Pass userId in params for server-side identification
    params: { userId, clientId: userId },
  });

  // Set up awareness (cursor positions, user presence)
  const awareness = provider.awareness;

  // Set local user state
  awareness.setLocalStateField('user', {
    id: userId,
    name: getDisplayName(userId),
    color: stringToColor(userId),
    initials: getInitials(userId),
  });

  // Handle connection status changes - notify all registered handlers
  provider.on('status', (event: { status: string }) => {
    console.log(`Collab status for ${pagePath}:`, event.status);
    const status: ConnectionStatus =
      event.status === 'connected' ? 'connected' :
      event.status === 'connecting' ? 'connecting' :
      'disconnected';
    const handlers = statusHandlers.get(pagePath);
    if (handlers) {
      handlers.forEach(handler => handler(status));
    }
  });

  // Handle awareness changes (user presence) - notify all registered handlers
  awareness.on('change', () => {
    const users: CollabUser[] = [];
    awareness.getStates().forEach((state, clientId) => {
      // Skip if no user info or if it's the local user
      if (state.user && clientId !== awareness.clientID) {
        users.push(state.user as CollabUser);
      }
    });
    const handlers = usersHandlers.get(pagePath);
    if (handlers) {
      handlers.forEach(handler => handler(users));
    }
  });

  // Initialize save state
  const saveState: SaveState = {
    status: 'saved',
    lastSavedContent: '',
    saveTimer: null,
    isInitialLoad: true,
  };
  saveStates.set(pagePath, saveState);

  // Set up Y.Text observer for auto-save
  const yText = doc.getText('content');
  yText.observe(() => {
    // Skip during initial load (sync from server)
    if (saveState.isInitialLoad) return;
    scheduleSave(pagePath, title);
  });

  // Mark initial load as complete after sync settles
  setTimeout(() => {
    saveState.isInitialLoad = false;
    saveState.lastSavedContent = yText.toString();
    console.log(`Initial load complete for: ${pagePath}`);
  }, 500);

  // Create session object
  const session: CollabSession = {
    doc,
    provider,
    pagePath,
    destroy: () => {
      console.log(`Destroying collab session for: ${pagePath}`);
      // Clear any pending save timer
      const state = saveStates.get(pagePath);
      if (state?.saveTimer) {
        clearTimeout(state.saveTimer);
      }
      saveStates.delete(pagePath);
      saveStatusHandlers.delete(pagePath);
      awareness.setLocalState(null);
      provider.disconnect();
      provider.destroy();
      doc.destroy();
      activeSessions.delete(pagePath);
    },
  };

  activeSessions.set(pagePath, session);
  return session;
}

/**
 * Initialize Y.Text content safely, waiting for WebSocket sync to complete.
 * This prevents race conditions where multiple clients insert content concurrently.
 *
 * @param session - The collaborative session
 * @param initialContent - Content to insert if Y.Text is empty after sync
 * @returns Promise that resolves when initialization is complete
 */
export function initializeContent(
  session: CollabSession,
  initialContent: string
): Promise<void> {
  return new Promise((resolve) => {
    const yText = getSharedText(session.doc);
    const provider = session.provider;

    // If already synced, check and initialize immediately
    if (provider.synced) {
      if (yText.length === 0 && initialContent) {
        yText.insert(0, initialContent);
        console.log(`Initialized content for ${session.pagePath} (already synced)`);
      }
      resolve();
      return;
    }

    // Wait for sync event
    const handleSync = (synced: boolean) => {
      if (synced) {
        provider.off('sync', handleSync);
        // After sync, check if content needs initialization
        if (yText.length === 0 && initialContent) {
          yText.insert(0, initialContent);
          console.log(`Initialized content for ${session.pagePath} (after sync)`);
        }
        resolve();
      }
    };

    provider.on('sync', handleSync);

    // Fallback timeout in case sync event doesn't fire
    setTimeout(() => {
      provider.off('sync', handleSync);
      if (yText.length === 0 && initialContent) {
        yText.insert(0, initialContent);
        console.log(`Initialized content for ${session.pagePath} (timeout fallback)`);
      }
      resolve();
    }, 2000);
  });
}

/**
 * Get the Yjs XmlFragment for ProseMirror content.
 * This is the shared type that y-prosemirror binds to.
 * @deprecated Use getSharedText() for new code - both editors should use the same Y.Text
 */
export function getXmlFragment(doc: Y.Doc, name: string = 'prosemirror'): Y.XmlFragment {
  return doc.getXmlFragment(name);
}

/**
 * Get the shared Yjs Text for content.
 * Both CodeMirror and ProseMirror editors use this same Y.Text,
 * which contains the raw markdown content.
 */
export function getSharedText(doc: Y.Doc): Y.Text {
  return doc.getText('content');
}

/**
 * Release a collaborative session.
 * Sessions persist to allow seamless switching between formatted/raw views.
 * Only truly destroyed when navigating to a different page.
 */
export function destroyCollabSession(pagePath: string): void {
  // Don't destroy - sessions persist for view switching
  // They'll be cleaned up when navigating to a different page
  console.log(`Session release requested for: ${pagePath} (keeping alive)`);
}

/**
 * Force destroy all sessions except the current one.
 * Called when navigating to a new page.
 */
function cleanupOtherSessions(currentPagePath: string): void {
  const toDelete: string[] = [];
  activeSessions.forEach((session, path) => {
    if (path !== currentPagePath) {
      console.log(`Cleaning up old session for: ${path}`);
      session.destroy(); // This now cleans up saveStates and saveStatusHandlers too
      statusHandlers.delete(path);
      usersHandlers.delete(path);
      toDelete.push(path);
    }
  });
  toDelete.forEach(path => activeSessions.delete(path));
}

/**
 * Get the current save status for a session.
 */
export function getSaveStatus(pagePath: string): SaveStatus {
  return saveStates.get(pagePath)?.status || 'saved';
}

/**
 * Get all active users in a session.
 */
export function getSessionUsers(pagePath: string): CollabUser[] {
  const session = activeSessions.get(pagePath);
  if (!session) return [];

  const users: CollabUser[] = [];
  const awareness = session.provider.awareness;

  awareness.getStates().forEach((state, clientId) => {
    if (state.user && clientId !== awareness.clientID) {
      users.push(state.user as CollabUser);
    }
  });

  return users;
}

/**
 * Check if a session exists for a page.
 */
export function hasActiveSession(pagePath: string): boolean {
  return activeSessions.has(pagePath);
}

/**
 * Invalidate sessions for specific pages.
 * This destroys the session, forcing a fresh reconnect with new content.
 * Used when git content changes outside of collaborative editing (e.g., thread merge).
 */
export function invalidateSessions(pagePaths: string[]): void {
  for (const pagePath of pagePaths) {
    const session = activeSessions.get(pagePath);
    if (session) {
      console.log(`Invalidating collab session for: ${pagePath}`);
      session.destroy();
    }
  }
}

/**
 * Update editing state for merge blocking.
 * Only editors (not viewers) are counted for merge blocking.
 */
export async function setEditingState(
  pagePath: string,
  userId: string,
  editing: boolean
): Promise<void> {
  try {
    const params = new URLSearchParams({
      room_name: pagePath,
      client_id: userId,
      editing: String(editing),
    });
    await fetch(`http://localhost:8000/api/collab/editing-state?${params}`, {
      method: 'POST',
    });
    console.log(`Editing state: ${pagePath} = ${editing}`);
  } catch (error) {
    console.error('Failed to update editing state:', error);
  }
}
