/**
 * Collaborative CodeMirror editor using Yjs for real-time synchronization.
 * Uses the shared Y.Text that is also used by CollaborativeEditor (ProseMirror).
 * Only shows cursors from other Raw mode users (not Formatted mode users).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

import { createCollabSession, destroyCollabSession, getSharedText, type CollabUser, type ConnectionStatus } from '../../services/collab';
import { updatePage } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

import './codemirror-collab.css';

// Debounce delay for auto-save (milliseconds)
const SAVE_DEBOUNCE_MS = 2000;

// Editor mode type for filtering cursors
type EditorMode = 'formatted' | 'raw';

// Effect to trigger cursor decoration updates
const updateCursorsEffect = StateEffect.define<null>();

// Cursor widget for remote users
class CursorWidget extends WidgetType {
  color: string;
  name: string;

  constructor(color: string, name: string) {
    super();
    this.color = color;
    this.name = name;
  }

  toDOM() {
    const cursor = document.createElement('span');
    cursor.className = 'yRemoteSelectionHead';
    cursor.style.borderColor = this.color;
    cursor.style.backgroundColor = this.color;
    cursor.setAttribute('data-user', this.name);
    return cursor;
  }

  eq(other: CursorWidget) {
    return this.color === other.color && this.name === other.name;
  }
}

/**
 * Create a CodeMirror extension that renders remote cursors filtered by mode.
 * Only shows cursors from users with mode === 'raw'.
 */
function createRawModeCursorExtension(
  awareness: Awareness,
  yText: Y.Text,
  localClientId: number
) {
  const cursorField = StateField.define<DecorationSet>({
    create() {
      return Decoration.none;
    },
    update(decorations, tr) {
      // Check if we should rebuild decorations
      const shouldRebuild = tr.effects.some(e => e.is(updateCursorsEffect)) || tr.docChanged;
      if (!shouldRebuild) {
        return decorations.map(tr.changes);
      }

      const builder = new RangeSetBuilder<Decoration>();
      const docLength = tr.state.doc.length;

      // Collect and sort decorations by position
      const decos: { from: number; to: number; decoration: Decoration }[] = [];

      awareness.getStates().forEach((state, clientId) => {
        if (clientId === localClientId) return;
        if (!state.cursor) return;

        const cursor = state.cursor as {
          anchor: Y.RelativePosition;
          head: Y.RelativePosition;
          mode?: EditorMode;
        };
        const user = state.user as { name: string; color: string } | undefined;

        if (!user) return;

        // Only show cursors from Raw mode users
        if (cursor.mode !== 'raw') return;

        // Convert relative positions to absolute
        const anchorAbs = Y.createAbsolutePositionFromRelativePosition(cursor.anchor, yText.doc!);
        const headAbs = Y.createAbsolutePositionFromRelativePosition(cursor.head, yText.doc!);

        if (!anchorAbs || !headAbs) return;

        const anchor = Math.min(anchorAbs.index, docLength);
        const head = Math.min(headAbs.index, docLength);

        // Add selection highlight if there's a range
        if (anchor !== head) {
          const from = Math.min(anchor, head);
          const to = Math.max(anchor, head);
          decos.push({
            from,
            to,
            decoration: Decoration.mark({
              class: 'yRemoteSelection',
              attributes: { style: `background-color: ${user.color}33;` }
            })
          });
        }

        // Add cursor widget at head position
        decos.push({
          from: head,
          to: head,
          decoration: Decoration.widget({
            widget: new CursorWidget(user.color, user.name),
            side: 1
          })
        });
      });

      // Sort by position and add to builder
      decos.sort((a, b) => a.from - b.from || a.to - b.to);
      for (const { from, to, decoration } of decos) {
        if (from === to) {
          builder.add(from, to, decoration);
        } else {
          builder.add(from, to, decoration);
        }
      }

      return builder.finish();
    },
    provide: field => EditorView.decorations.from(field)
  });

  return cursorField;
}

export interface CollabStatus {
  connectionStatus: ConnectionStatus;
  remoteUsers: CollabUser[];
  saveStatus: 'saved' | 'saving' | 'dirty';
}

interface CollaborativeCodeMirrorEditorProps {
  pagePath: string;
  pageTitle: string;
  initialContent: string;
  className?: string;
  editable?: boolean;
  onCollabStatusChange?: (status: CollabStatus) => void;
}

export const CollaborativeCodeMirrorEditor: React.FC<CollaborativeCodeMirrorEditorProps> = ({
  pagePath,
  pageTitle,
  initialContent,
  className,
  editable = true,
  onCollabStatusChange,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [remoteUsers, setRemoteUsers] = useState<CollabUser[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const { userId } = useAuth();
  const sessionRef = useRef<ReturnType<typeof createCollabSession> | null>(null);
  const initializedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const isInitialLoadRef = useRef(true);
  const yTextRef = useRef<ReturnType<typeof getSharedText> | null>(null);

  // Handle status changes
  const handleStatusChange = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
  }, []);

  // Handle users changes
  const handleUsersChange = useCallback((users: CollabUser[]) => {
    setRemoteUsers(users);
  }, []);

  // Save document to backend
  const saveDocument = useCallback(async () => {
    if (!yTextRef.current) return;

    const content = yTextRef.current.toString();

    // Skip if content hasn't changed
    if (content === lastSavedContentRef.current) {
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('saving');
    try {
      await updatePage(pageTitle, {
        content,
        author: userId || 'collaborative',
      });
      lastSavedContentRef.current = content;
      setSaveStatus('saved');
      console.log(`Auto-saved ${pageTitle} (raw)`);
    } catch (error) {
      console.error('Failed to save:', error);
      setSaveStatus('dirty');
    }
  }, [pageTitle, userId]);

  // Schedule debounced save
  const scheduleSave = useCallback(() => {
    if (isInitialLoadRef.current) {
      return;
    }

    setSaveStatus('dirty');

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveDocument();
    }, SAVE_DEBOUNCE_MS);
  }, [saveDocument]);

  // Initialize editor with Yjs
  useEffect(() => {
    if (!editorRef.current || !userId || initializedRef.current) return;

    // Create collaborative session
    const session = createCollabSession(
      pagePath,
      userId,
      handleStatusChange,
      handleUsersChange
    );
    sessionRef.current = session;

    // Get shared Y.Text (same as used by ProseMirror editor)
    const yText = getSharedText(session.doc);
    yTextRef.current = yText;

    // Initialize content after a short delay to allow for sync
    setTimeout(() => {
      if (yText.length === 0 && initialContent) {
        yText.insert(0, initialContent);
      }
    }, 100);

    // Detect dark mode
    const isDarkMode = document.documentElement.classList.contains('dark');

    // Get awareness for cursor sync
    const awareness = session.provider.awareness;

    // Build extensions
    // Use yCollab with null awareness (we handle cursors ourselves with mode filtering)
    const extensions = [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      EditorView.editable.of(editable), // Set editable state
      yCollab(yText, null), // null = no cursor sync from yCollab
      createRawModeCursorExtension(awareness, yText, awareness.clientID), // our filtered cursor sync
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '14px',
        },
        '.cm-scroller': {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          overflow: 'auto',
        },
        '.cm-content': {
          padding: '16px',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          border: 'none',
        },
      }),
    ];

    // Add dark theme if needed
    if (isDarkMode) {
      extensions.push(oneDark);
    }

    // Create editor state
    const state = EditorState.create({
      doc: yText.toString(),
      extensions,
    });

    // Create editor view
    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;
    initializedRef.current = true;

    // Store initial content for comparison
    lastSavedContentRef.current = initialContent;

    // Allow saves after initial load settles
    const enableSaveTimer = setTimeout(() => {
      isInitialLoadRef.current = false;
    }, 500);

    // Listen for awareness changes to update cursor decorations (always, for viewing others)
    const handleAwarenessChange = () => {
      view.dispatch({ effects: updateCursorsEffect.of(null) });
    };
    awareness.on('change', handleAwarenessChange);

    // Only set up cursor broadcasting, blur handler, and save when editable
    let handleBlur: (() => void) | null = null;
    let handleYjsUpdate: ((_update: Uint8Array, origin: unknown) => void) | null = null;

    if (editable) {
      // Broadcast local selection to awareness with mode:'raw'
      const broadcastSelection = () => {
        const selection = view.state.selection.main;
        awareness.setLocalStateField('cursor', {
          anchor: Y.createRelativePositionFromTypeIndex(yText, selection.anchor),
          head: Y.createRelativePositionFromTypeIndex(yText, selection.head),
          mode: 'raw' as EditorMode,
        });
      };

      // Listen for selection changes
      const selectionListener = EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          broadcastSelection();
        }
      });
      view.dispatch({ effects: StateEffect.appendConfig.of(selectionListener) });

      // Broadcast initial selection
      broadcastSelection();

      // Clear cursor on blur
      handleBlur = () => {
        awareness.setLocalStateField('cursor', null);
      };
      view.dom.addEventListener('blur', handleBlur);

      // Set up Yjs document observer for auto-save (only on LOCAL changes)
      handleYjsUpdate = (_update: Uint8Array, origin: unknown) => {
        if (origin !== session.provider) {
          scheduleSave();
        }
      };
      session.doc.on('update', handleYjsUpdate);
    }

    // Cleanup on unmount
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      clearTimeout(enableSaveTimer);
      isInitialLoadRef.current = true;
      if (handleBlur) {
        view.dom.removeEventListener('blur', handleBlur);
      }
      awareness.off('change', handleAwarenessChange);
      if (editable) {
        awareness.setLocalStateField('cursor', null);
      }
      if (handleYjsUpdate) {
        session.doc.off('update', handleYjsUpdate);
      }
      view.destroy();
      viewRef.current = null;
      yTextRef.current = null;
      initializedRef.current = false;
      destroyCollabSession(pagePath);
      sessionRef.current = null;
    };
  }, [pagePath, userId, initialContent, handleStatusChange, handleUsersChange, scheduleSave, editable]);

  // Notify parent of status changes
  useEffect(() => {
    if (onCollabStatusChange) {
      onCollabStatusChange({ connectionStatus, remoteUsers, saveStatus });
    }
  }, [connectionStatus, remoteUsers, saveStatus, onCollabStatusChange]);

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Editor */}
      <div
        ref={editorRef}
        className="codemirror-collab-editor flex-1 overflow-hidden"
      />
    </div>
  );
};

export default CollaborativeCodeMirrorEditor;
