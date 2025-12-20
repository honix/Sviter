/**
 * Collaborative ProseMirror editor using Yjs for real-time synchronization.
 * Uses the shared Y.Text that is also used by CollaborativeCodeMirrorEditor.
 *
 * Unlike y-prosemirror's direct binding, this manually syncs between Y.Text (markdown)
 * and ProseMirror's document model to ensure both editors stay in sync.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState, Transaction, Plugin, PluginKey } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, emDash, ellipsis } from 'prosemirror-inputrules';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

import { schema } from '../../editor/schema';
import { buildKeymap } from '../../editor/keymap';
import { markdownToProseMirror, prosemirrorToMarkdown } from '../../editor/conversion';
import { createCollabSession, destroyCollabSession, getSharedText, type CollabUser, type ConnectionStatus, type SaveStatus } from '../../services/collab';
import { useAuth } from '../../contexts/AuthContext';
import { EditorToolbar } from './EditorToolbar';

import './prosemirror.css';

// Plugin key for remote cursor decorations
const remoteCursorPluginKey = new PluginKey('remoteCursors');

// Editor mode type for filtering cursors
type EditorMode = 'formatted' | 'raw';

interface RelativeCursorState {
  anchor: Y.RelativePosition;
  head: Y.RelativePosition;
  mode?: EditorMode;
}

/**
 * Convert Y.Text character offset to approximate ProseMirror position.
 */
function textOffsetToPmPos(doc: ReturnType<typeof markdownToProseMirror>, targetOffset: number): number {
  let offset = 0;
  let resultPos = 0;
  let lastBlockEnd = 0;
  let found = false;

  doc.descendants((node, pos) => {
    if (found) return false;

    if (node.isBlock && pos > 0 && pos > lastBlockEnd) {
      if (offset >= targetOffset) {
        resultPos = pos;
        found = true;
        return false;
      }
      offset += 1;
      lastBlockEnd = pos + node.nodeSize;
    }

    if (node.isText) {
      const nodeLen = node.nodeSize;
      if (offset + nodeLen >= targetOffset) {
        resultPos = pos + (targetOffset - offset);
        found = true;
        return false;
      }
      offset += nodeLen;
    }

    return true;
  });

  if (!found) {
    resultPos = doc.content.size;
  }

  return Math.max(0, Math.min(resultPos, doc.content.size));
}

/**
 * Convert ProseMirror position to approximate Y.Text character offset.
 */
function pmPosToTextOffset(doc: ReturnType<typeof markdownToProseMirror>, pos: number): number {
  let offset = 0;
  let lastBlockEnd = 0;

  doc.nodesBetween(0, Math.min(pos, doc.content.size), (node, nodePos) => {
    if (node.isBlock && nodePos > 0 && nodePos > lastBlockEnd) {
      offset += 1;
      lastBlockEnd = nodePos + node.nodeSize;
    }
    if (node.isText) {
      const textStart = nodePos;
      const textEnd = nodePos + node.nodeSize;
      const relevantStart = Math.max(textStart, 0);
      const relevantEnd = Math.min(textEnd, pos);
      if (relevantEnd > relevantStart) {
        offset += relevantEnd - relevantStart;
      }
    }
    return true;
  });

  return offset;
}

/**
 * Create a ProseMirror plugin that renders remote user cursors and selections.
 * Only shows cursors from users in the same editor mode (formatted).
 */
function createRemoteCursorPlugin(
  awareness: Awareness,
  yText: Y.Text,
  localClientId: number
): Plugin {
  return new Plugin({
    key: remoteCursorPluginKey,
    state: {
      init() {
        return DecorationSet.empty;
      },
      apply(tr, decorationSet, _oldState, newState) {
        // Only rebuild on doc changes or meta trigger
        if (!tr.docChanged && !tr.getMeta(remoteCursorPluginKey)) {
          return decorationSet.map(tr.mapping, newState.doc);
        }

        const decorations: Decoration[] = [];
        const markdown = yText.toString();

        awareness.getStates().forEach((state, clientId) => {
          if (clientId === localClientId) return;
          if (!state.cursor) return;

          const cursor = state.cursor as RelativeCursorState;
          const user = state.user as { name: string; color: string } | undefined;

          if (!user) return;

          // Only show cursors from users in the same mode (formatted)
          if (cursor.mode !== 'formatted') return;

          // Convert Y.RelativePosition to absolute index in Y.Text
          const anchorAbs = Y.createAbsolutePositionFromRelativePosition(cursor.anchor, yText.doc!);
          const headAbs = Y.createAbsolutePositionFromRelativePosition(cursor.head, yText.doc!);

          if (!anchorAbs || !headAbs) return;

          // Convert Y.Text positions to ProseMirror positions
          const anchor = textOffsetToPmPos(newState.doc, Math.min(anchorAbs.index, markdown.length));
          const head = textOffsetToPmPos(newState.doc, Math.min(headAbs.index, markdown.length));

          // Add selection highlight if there's a range
          if (anchor !== head) {
            const from = Math.min(anchor, head);
            const to = Math.max(anchor, head);
            decorations.push(
              Decoration.inline(from, to, {
                class: 'yRemoteSelection',
                style: `background-color: ${user.color}33;`, // 20% opacity
              })
            );
          }

          // Add cursor caret at head position
          decorations.push(
            Decoration.widget(head, () => {
              const cursorEl = document.createElement('span');
              cursorEl.className = 'collaboration-cursor';
              cursorEl.style.setProperty('--cursor-color', user.color);
              cursorEl.setAttribute('data-user', user.name);
              return cursorEl;
            }, { side: 1 })
          );
        });

        return DecorationSet.create(newState.doc, decorations);
      },
    },
    props: {
      decorations(state) {
        return remoteCursorPluginKey.getState(state);
      },
    },
  });
}

export interface CollabStatus {
  connectionStatus: ConnectionStatus;
  remoteUsers: CollabUser[];
  saveStatus: 'saved' | 'saving' | 'dirty';
}

interface CollaborativeEditorProps {
  pagePath: string;
  pageTitle: string;
  initialContent: string;
  className?: string;
  editable?: boolean;
  onCollabStatusChange?: (status: CollabStatus) => void;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  pagePath,
  pageTitle,
  initialContent,
  className,
  editable = true,
  onCollabStatusChange,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [remoteUsers, setRemoteUsers] = useState<CollabUser[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const { userId } = useAuth();
  const sessionRef = useRef<ReturnType<typeof createCollabSession> | null>(null);
  const initializedRef = useRef(false);
  const yTextRef = useRef<Y.Text | null>(null);
  // Flag to prevent update loops
  const isUpdatingFromYjsRef = useRef(false);
  const isUpdatingYjsRef = useRef(false);
  // Use ref for editable to avoid re-running useEffect when it changes
  const editableRef = useRef(editable);
  editableRef.current = editable;

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
      handleStatusChange,
      handleUsersChange,
      handleSaveStatusChange,
      pageTitle
    );
    sessionRef.current = session;

    // Get shared Y.Text (same as used by CodeMirror editor)
    const yText = getSharedText(session.doc);
    yTextRef.current = yText;

    // Initialize content after a short delay to allow for sync
    setTimeout(() => {
      if (yText.length === 0 && initialContent) {
        yText.insert(0, initialContent);
      }
    }, 100);

    // Build input rules for markdown shortcuts
    const buildInputRulesPlugin = () => {
      const rules = [
        textblockTypeInputRule(/^#\s$/, schema.nodes.heading, { level: 1 }),
        textblockTypeInputRule(/^##\s$/, schema.nodes.heading, { level: 2 }),
        textblockTypeInputRule(/^###\s$/, schema.nodes.heading, { level: 3 }),
        wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),
        wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list),
        textblockTypeInputRule(/^```$/, schema.nodes.code_block),
        ...smartQuotes,
        ellipsis,
        emDash,
      ];
      return inputRules({ rules });
    };

    // Parse initial content from Y.Text
    const initialMarkdown = yText.toString() || initialContent;
    const doc = markdownToProseMirror(initialMarkdown);

    // Get awareness for cursor tracking
    const awareness = session.provider.awareness;

    // Create remote cursor plugin
    const remoteCursorPlugin = createRemoteCursorPlugin(
      awareness,
      yText,
      awareness.clientID
    );

    // Create editor state
    const state = EditorState.create({
      doc,
      schema,
      plugins: [
        history(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
        }),
        buildKeymap(),
        keymap(baseKeymap),
        buildInputRulesPlugin(),
        remoteCursorPlugin,
      ],
    });

    // Create editor view with dispatch interceptor
    const view = new EditorView(editorRef.current, {
      state,
      editable: () => editableRef.current,
      dispatchTransaction(tr: Transaction) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

        // Only sync changes if editable (read from ref for current value)
        if (editableRef.current) {
          // If document changed and we're not updating from Yjs, sync to Y.Text
          if (tr.docChanged && !isUpdatingFromYjsRef.current) {
            isUpdatingYjsRef.current = true;
            const markdown = prosemirrorToMarkdown(newState.doc);

            // Update Y.Text with the new markdown
            if (yText.toString() !== markdown) {
              session.doc.transact(() => {
                yText.delete(0, yText.length);
                yText.insert(0, markdown);
              });
            }
            isUpdatingYjsRef.current = false;
          }

          // Broadcast local selection to awareness for other users
          if (tr.selectionSet || tr.docChanged) {
            const { anchor, head } = newState.selection;
            // Convert ProseMirror positions to Y.Text character offsets
            const anchorOffset = pmPosToTextOffset(newState.doc, anchor);
            const headOffset = pmPosToTextOffset(newState.doc, head);
            // Use Y.RelativePosition for CRDT-safe cursor positions (compatible with y-codemirror.next)
            // Include mode so other editors can filter by mode
            awareness.setLocalStateField('cursor', {
              anchor: Y.createRelativePositionFromTypeIndex(yText, anchorOffset),
              head: Y.createRelativePositionFromTypeIndex(yText, headOffset),
              mode: 'formatted' as EditorMode,
            });
          }
        }
      },
    });

    // Set up cursor handlers
    let handleBlur: (() => void) | null = null;

    // Clear cursor from awareness when editor loses focus
    handleBlur = () => {
      awareness.setLocalStateField('cursor', null);
    };
    view.dom.addEventListener('blur', handleBlur);

    viewRef.current = view;
    setEditorView(view);
    initializedRef.current = true;

    // Observe Y.Text changes and update ProseMirror (needed for both edit and view modes)
    const handleYTextChange = () => {
      // Skip if we're the one updating Y.Text
      if (isUpdatingYjsRef.current) return;

      const markdown = yText.toString();
      const newDoc = markdownToProseMirror(markdown);

      // Only update if content is different
      if (!view.state.doc.eq(newDoc)) {
        isUpdatingFromYjsRef.current = true;
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
        view.dispatch(tr);
        isUpdatingFromYjsRef.current = false;
      }
    };
    yText.observe(handleYTextChange);

    // Listen for awareness changes to update remote cursor decorations
    const handleAwarenessChange = () => {
      const tr = view.state.tr.setMeta(remoteCursorPluginKey, true);
      view.dispatch(tr);
    };
    awareness.on('change', handleAwarenessChange);

    // Cleanup on unmount
    return () => {
      // Remove event listeners
      if (handleBlur) {
        view.dom.removeEventListener('blur', handleBlur);
      }
      // Remove observers
      yText.unobserve(handleYTextChange);
      awareness.off('change', handleAwarenessChange);
      // Clear cursor before destroying
      awareness.setLocalStateField('cursor', null);
      view.destroy();
      viewRef.current = null;
      yTextRef.current = null;
      setEditorView(null);
      initializedRef.current = false;
      destroyCollabSession(pagePath);
      sessionRef.current = null;
    };
    // Note: editable is NOT in deps - we use editableRef to avoid remounting on edit/view switch
  }, [pagePath, userId, initialContent, handleStatusChange, handleUsersChange, handleSaveStatusChange, pageTitle]);

  // Notify parent of status changes
  useEffect(() => {
    if (onCollabStatusChange) {
      onCollabStatusChange({ connectionStatus, remoteUsers, saveStatus });
    }
  }, [connectionStatus, remoteUsers, saveStatus, onCollabStatusChange]);

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Toolbar - only show when editable */}
      {editable && (
        <div className="flex items-center border-b border-border px-2 py-1 bg-muted/30">
          <EditorToolbar editorView={editorView} />
        </div>
      )}

      {/* Editor */}
      <div
        ref={editorRef}
        className={`prosemirror-editor flex-1 overflow-auto ${editable ? 'editable' : 'readonly'}`}
      />
    </div>
  );
};

export default CollaborativeEditor;
