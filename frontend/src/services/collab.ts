/**
 * Collaborative editing service using Yjs and y-websocket.
 * Manages document synchronization and user awareness for real-time collaboration.
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { stringToColor, getInitials, getDisplayName } from '../utils/colors';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

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

// Active sessions by page path
const activeSessions = new Map<string, CollabSession>();

/**
 * Create or get an existing collaborative editing session for a page.
 * Uses y-websocket to sync with the backend collaboration server.
 */
export function createCollabSession(
  pagePath: string,
  userId: string,
  onStatusChange?: StatusHandler,
  onUsersChange?: UsersHandler
): CollabSession {
  // Return existing session if already connected to this page
  const existing = activeSessions.get(pagePath);
  if (existing) {
    console.log(`Reusing existing collab session for: ${pagePath}`);
    return existing;
  }

  console.log(`Creating new collab session for: ${pagePath}`);

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

  // Handle connection status changes
  provider.on('status', (event: { status: string }) => {
    console.log(`Collab status for ${pagePath}:`, event.status);
    if (onStatusChange) {
      const status: ConnectionStatus =
        event.status === 'connected' ? 'connected' :
        event.status === 'connecting' ? 'connecting' :
        'disconnected';
      onStatusChange(status);
    }
  });

  // Handle awareness changes (user presence)
  awareness.on('change', () => {
    if (onUsersChange) {
      const users: CollabUser[] = [];
      awareness.getStates().forEach((state, clientId) => {
        // Skip if no user info or if it's the local user
        if (state.user && clientId !== awareness.clientID) {
          users.push(state.user as CollabUser);
        }
      });
      onUsersChange(users);
    }
  });

  // Create session object
  const session: CollabSession = {
    doc,
    provider,
    pagePath,
    destroy: () => {
      console.log(`Destroying collab session for: ${pagePath}`);
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
 * Destroy a collaborative session for a page.
 */
export function destroyCollabSession(pagePath: string): void {
  const session = activeSessions.get(pagePath);
  if (session) {
    session.destroy();
  }
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
