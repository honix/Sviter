/**
 * Hook for collaborative CSV data editing using Yjs.
 * Provides access to CSV data via Y.Array<Y.Map> with real-time sync.
 */

import { useState, useEffect, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useAuth } from '../contexts/AuthContext';
import { stringToColor, getInitials, getDisplayName } from '../utils/colors';
import { getWsUrl, getApiUrl } from '../utils/url';
import { updatePage } from '../services/api';

// Debounce delay for auto-save (milliseconds)
const SAVE_DEBOUNCE_MS = 2000;

export interface DataRow {
  [key: string]: string | number | boolean;
}

export type SaveStatus = 'saved' | 'saving' | 'dirty';

export interface UseCSVResult<T extends DataRow> {
  /** Current rows from the data file */
  rows: T[];
  /** Column headers (from first row or explicitly set) */
  headers: string[];
  /** Update a specific cell value */
  updateCell: (rowIndex: number, column: keyof T, value: string) => void;
  /** Add a new row at the end */
  addRow: (row: T) => void;
  /** Delete a row by index */
  deleteRow: (rowIndex: number) => void;
  /** Insert a row at a specific index */
  insertRow: (index: number, row: T) => void;
  /** Whether the data has been loaded */
  isLoaded: boolean;
  /** Whether the data is currently syncing */
  isSyncing: boolean;
  /** Connection status */
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  /** Save status for the data */
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

// Active data sessions by page path
const activeDataSessions = new Map<string, {
  doc: Y.Doc;
  provider: WebsocketProvider;
  yArray: Y.Array<Y.Map<any>>;
  headers: string[];
  saveTimer: ReturnType<typeof setTimeout> | null;
  lastSavedContent: string;
  isInitialLoad: boolean;
  saveStatus: SaveStatus;
}>();

/**
 * Serialize Y.Array to CSV and save to backend.
 */
async function saveCSVData(pageId: string): Promise<void> {
  const session = activeDataSessions.get(pageId);
  if (!session) return;

  const content = serializeDataToCSV(session.yArray);

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
    console.log(`Saved CSV data: ${pageId}`);
  } catch (error) {
    console.error(`Failed to save CSV ${pageId}:`, error);
    // Revert to dirty so it will retry
    session.saveStatus = 'dirty';
    notifySaveStatus(pageId, 'dirty');
  }
}

/**
 * Schedule a debounced save for CSV data.
 */
function scheduleSaveCSV(pageId: string): void {
  const session = activeDataSessions.get(pageId);
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
    saveCSVData(pageId);
    session.saveTimer = null;
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Hook for collaborative CSV data editing.
 * Syncs CSV data via Yjs Y.Array<Y.Map>.
 *
 * @param pageId - The path to the CSV file (e.g., "data/tasks.csv")
 * @param initialHeaders - Optional initial headers if creating new file
 */
export function useCSV<T extends DataRow = DataRow>(
  pageId: string,
  initialHeaders?: string[]
): UseCSVResult<T> {
  const { userId } = useAuth();
  const [rows, setRows] = useState<T[]>([]);
  const [headers, setHeaders] = useState<string[]>(initialHeaders || []);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [session, setSession] = useState<typeof activeDataSessions extends Map<string, infer V> ? V : never>();

  useEffect(() => {
    if (!userId || !pageId || !pageId.endsWith('.csv')) {
      return;
    }

    // Check for existing session
    let existingSession = activeDataSessions.get(pageId);
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
        name: getDisplayName(userId),
        color: stringToColor(userId),
        initials: getInitials(userId),
      });

      // Get Y.Array for data
      const yArray = doc.getArray<Y.Map<any>>('data');

      existingSession = {
        doc,
        provider,
        yArray,
        headers: initialHeaders || [],
        saveTimer: null,
        lastSavedContent: '',
        isInitialLoad: true,
        saveStatus: 'saved' as SaveStatus,
      };
      activeDataSessions.set(pageId, existingSession);

      // Set up auto-save observer
      yArray.observeDeep(() => {
        scheduleSaveCSV(pageId);
      });

      // Mark initial load complete after sync settles
      provider.on('sync', (synced: boolean) => {
        if (synced) {
          setTimeout(() => {
            const session = activeDataSessions.get(pageId);
            if (session) {
              session.isInitialLoad = false;
              session.lastSavedContent = serializeDataToCSV(session.yArray);
              console.log(`CSV initial load complete: ${pageId}`);
            }
          }, 500);
        }
      });
    }

    const { provider, yArray, doc } = existingSession;

    // Handle connection status - always set up for this hook instance
    const handleStatus = (event: { status: string }) => {
      setConnectionStatus(
        event.status === 'connected' ? 'connected' :
        event.status === 'connecting' ? 'connecting' :
        'disconnected'
      );
    };
    provider.on('status', handleStatus);

    // Handle sync - fetch and initialize CSV content if empty
    const handleSync = async (synced: boolean) => {
      if (synced) {
        setIsSyncing(false);

        // If Y.Array is empty, fetch CSV content from server and initialize
        if (yArray.length === 0) {
          try {
            const response = await fetch(`${getApiUrl()}/api/pages/${encodeURIComponent(pageId)}`);
            if (response.ok) {
              const page = await response.json();
              if (page.content) {
                initializeDataFromCSV(pageId, page.content, doc);
              }
            }
          } catch (err) {
            console.error('Failed to fetch CSV content:', err);
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

    // Convert Y.Array to plain array
    const updateRows = () => {
      const yArray = existingSession!.yArray;
      const newRows: T[] = yArray.toArray().map(yMap => {
        const obj: any = {};
        yMap.forEach((value, key) => {
          obj[key] = value;
        });
        return obj as T;
      });
      setRows(newRows);

      // Extract headers from first row if not set
      if (newRows.length > 0 && headers.length === 0) {
        const firstRowHeaders = Object.keys(newRows[0]);
        setHeaders(firstRowHeaders);
        existingSession!.headers = firstRowHeaders;
      }
    };

    // Initial load
    updateRows();

    // Observe changes - use observeDeep to catch Y.Map updates inside the array
    existingSession.yArray.observeDeep(updateRows);

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
      existingSession?.yArray.unobserveDeep(updateRows);
      // Remove event handlers to avoid duplicates
      provider.off('status', handleStatus);
      provider.off('sync', handleSync);
      // Remove save status listener
      saveStatusListeners.get(pageId)?.delete(handleSaveStatus);
      // Don't destroy session - let it persist for view switching
    };
  }, [pageId, userId, initialHeaders]);

  const updateCell = useCallback((rowIndex: number, column: keyof T, value: string) => {
    if (!session?.yArray) return;
    const yMap = session.yArray.get(rowIndex);
    if (yMap) {
      yMap.set(column as string, value);
    }
  }, [session]);

  const addRow = useCallback((row: T) => {
    if (!session?.yArray) return;
    const yMap = new Y.Map<any>();
    Object.entries(row).forEach(([key, value]) => {
      yMap.set(key, value);
    });
    session.yArray.push([yMap]);
  }, [session]);

  const deleteRow = useCallback((rowIndex: number) => {
    if (!session?.yArray) return;
    session.yArray.delete(rowIndex, 1);
  }, [session]);

  const insertRow = useCallback((index: number, row: T) => {
    if (!session?.yArray) return;
    const yMap = new Y.Map<any>();
    Object.entries(row).forEach(([key, value]) => {
      yMap.set(key, value);
    });
    session.yArray.insert(index, [yMap]);
  }, [session]);

  return {
    rows,
    headers,
    updateCell,
    addRow,
    deleteRow,
    insertRow,
    isLoaded,
    isSyncing,
    connectionStatus,
    saveStatus,
  };
}

/**
 * Initialize a data page from CSV content.
 * Call this when first loading a CSV file to populate the Y.Array.
 */
export function initializeDataFromCSV(
  _pageId: string,
  csvContent: string,
  doc: Y.Doc
): void {
  const yArray = doc.getArray<Y.Map<any>>('data');

  // Don't reinitialize if already has data
  if (yArray.length > 0) return;

  const lines = csvContent.split('\n').filter(l => l.trim());
  if (lines.length === 0) return;

  // Parse headers
  const headers = parseCSVLine(lines[0]);

  // Parse rows in a transaction
  doc.transact(() => {
    lines.slice(1).forEach(line => {
      const values = parseCSVLine(line);
      const yMap = new Y.Map<any>();
      headers.forEach((h, i) => {
        yMap.set(h, values[i] ?? '');
      });
      yArray.push([yMap]);
    });
  });
}

/**
 * Serialize Y.Array data to CSV string.
 */
export function serializeDataToCSV(yArray: Y.Array<Y.Map<any>>): string {
  const rows = yArray.toArray();
  if (rows.length === 0) return '';

  // Get headers from first row
  const headers: string[] = [];
  rows[0].forEach((_, key) => headers.push(key));

  // Build CSV
  const lines = [headers.join(',')];
  rows.forEach(yMap => {
    const values = headers.map(h => {
      const v = yMap.get(h);
      // Escape and quote if needed
      const str = String(v ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    lines.push(values.join(','));
  });

  return lines.join('\n');
}

/**
 * Parse a CSV line into values.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Clean up a data session when navigating away.
 */
export function destroyDataSession(pageId: string): void {
  const session = activeDataSessions.get(pageId);
  if (session) {
    // Clear pending save timer
    if (session.saveTimer) {
      clearTimeout(session.saveTimer);
    }
    session.provider.awareness.setLocalState(null);
    session.provider.disconnect();
    session.provider.destroy();
    session.doc.destroy();
    activeDataSessions.delete(pageId);
  }
}

/**
 * Check if a data session exists.
 */
export function hasDataSession(pageId: string): boolean {
  return activeDataSessions.has(pageId);
}
