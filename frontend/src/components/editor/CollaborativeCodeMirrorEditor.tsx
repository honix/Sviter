/**
 * Collaborative CodeMirror editor using Yjs for real-time synchronization.
 * Uses the shared Y.Text that is also used by CollaborativeEditor (ProseMirror).
 * Only shows cursors from other Raw mode users (not Formatted mode users).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState, StateField, StateEffect, RangeSetBuilder, Compartment } from '@codemirror/state';
import { EditorView, Decoration, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

import { createCollabSession, destroyCollabSession, getSharedText, initializeContent, type CollabUser, type ConnectionStatus, type SaveStatus } from '../../services/collab';
import { useAuth } from '../../contexts/AuthContext';

import './codemirror-collab.css';

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
  saveStatus: SaveStatus;
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const { userId, user } = useAuth();
  const sessionRef = useRef<ReturnType<typeof createCollabSession> | null>(null);
  const initializedRef = useRef(false);
  const yTextRef = useRef<ReturnType<typeof getSharedText> | null>(null);
  // Use ref for editable to avoid re-running useEffect when it changes
  const editableRef = useRef(editable);
  editableRef.current = editable;
  // Compartment for dynamic editable reconfiguration
  const editableCompartment = useRef(new Compartment());

  // Handle status changes
  const handleStatusChange = useCallback((status: ConnectionStatus) => {
    setConnectionStatus(status);
  }, []);

  // Handle users changes
  const handleUsersChange = useCallback((users: CollabUser[]) => {
    setRemoteUsers(users);
  }, []);

  // Handle save status changes (from collab service)
  const handleSaveStatusChange = useCallback((status: SaveStatus) => {
    setSaveStatus(status);
  }, []);

  // Initialize editor with Yjs
  useEffect(() => {
    if (!editorRef.current || !userId || initializedRef.current) return;

    // Create collaborative session
    const session = createCollabSession(
      pagePath,
      userId,
      user?.name,
      handleStatusChange,
      handleUsersChange,
      handleSaveStatusChange,
      pageTitle
    );
    sessionRef.current = session;

    // Get shared Y.Text (same as used by ProseMirror editor)
    const yText = getSharedText(session.doc);
    yTextRef.current = yText;

    // Initialize content safely (waits for WebSocket sync to prevent race conditions)
    initializeContent(session, initialContent);

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
      editableCompartment.current.of(EditorView.editable.of(editableRef.current)), // Compartment for dynamic editable
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

    // Listen for awareness changes to update cursor decorations (always, for viewing others)
    const handleAwarenessChange = () => {
      view.dispatch({ effects: updateCursorsEffect.of(null) });
    };
    awareness.on('change', handleAwarenessChange);

    // Set up cursor broadcasting and blur handler
    let handleBlur: (() => void) | null = null;

    // Always set up - handlers check editableRef at runtime
    {
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
    }

    // Cleanup on unmount
    return () => {
      if (handleBlur) {
        view.dom.removeEventListener('blur', handleBlur);
      }
      awareness.off('change', handleAwarenessChange);
      // Clear cursor before destroying
      awareness.setLocalStateField('cursor', null);
      view.destroy();
      viewRef.current = null;
      yTextRef.current = null;
      initializedRef.current = false;
      destroyCollabSession(pagePath);
      sessionRef.current = null;
    };
    // Note: editable is NOT in deps - we use editableRef to avoid remounting on edit/view switch
  }, [pagePath, userId, initialContent, handleStatusChange, handleUsersChange, handleSaveStatusChange, pageTitle]);

  // Dynamically reconfigure editable state when prop changes
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({
        effects: editableCompartment.current.reconfigure(
          EditorView.editable.of(editable)
        )
      });
    }
  }, [editable]);

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
