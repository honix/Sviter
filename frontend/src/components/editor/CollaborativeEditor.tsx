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
import { createCollabSession, destroyCollabSession, getSharedText, type CollabUser, type ConnectionStatus } from '../../services/collab';
import { updatePage } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { EditorToolbar } from './EditorToolbar';
import { Cloud, CloudOff, CloudUpload } from 'lucide-react';
import { stringToColor, getInitials } from '../../utils/colors';

// Debounce delay for auto-save (milliseconds)
const SAVE_DEBOUNCE_MS = 2000;
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

interface CollaborativeEditorProps {
  pagePath: string;
  pageTitle: string;
  initialContent: string;
  className?: string;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  pagePath,
  pageTitle,
  initialContent,
  className,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [remoteUsers, setRemoteUsers] = useState<CollabUser[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const { userId } = useAuth();
  const sessionRef = useRef<ReturnType<typeof createCollabSession> | null>(null);
  const initializedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const isInitialLoadRef = useRef(true);
  const yTextRef = useRef<Y.Text | null>(null);
  // Flag to prevent update loops
  const isUpdatingFromYjsRef = useRef(false);
  const isUpdatingYjsRef = useRef(false);

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

    const markdown = yTextRef.current.toString();

    // Skip if content hasn't changed
    if (markdown === lastSavedContentRef.current) {
      setSaveStatus('saved');
      return;
    }

    setSaveStatus('saving');
    try {
      await updatePage(pageTitle, {
        content: markdown,
        author: userId || 'collaborative',
      });
      lastSavedContentRef.current = markdown;
      setSaveStatus('saved');
      console.log(`Auto-saved ${pageTitle}`);
    } catch (error) {
      console.error('Failed to save:', error);
      setSaveStatus('dirty'); // Mark as dirty so user knows save failed
    }
  }, [pageTitle, userId]);

  // Schedule debounced save
  const scheduleSave = useCallback(() => {
    // Skip save during initial load
    if (isInitialLoadRef.current) {
      return;
    }

    setSaveStatus('dirty');

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Schedule new save
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
      editable: () => true,
      dispatchTransaction(tr: Transaction) {
        const newState = view.state.apply(tr);
        view.updateState(newState);

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
      },
    });

    // Clear cursor from awareness when editor loses focus
    // (new cursor position will be broadcast via dispatchTransaction when user clicks back)
    const handleBlur = () => {
      awareness.setLocalStateField('cursor', null);
    };
    view.dom.addEventListener('blur', handleBlur);

    viewRef.current = view;
    setEditorView(view);
    initializedRef.current = true;

    // Store initial content for comparison
    lastSavedContentRef.current = initialContent;

    // Allow saves after initial load settles (longer than content init delay)
    const enableSaveTimer = setTimeout(() => {
      isInitialLoadRef.current = false;
    }, 500);

    // Observe Y.Text changes and update ProseMirror
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
      // Trigger decoration rebuild by dispatching an empty transaction with meta
      const tr = view.state.tr.setMeta(remoteCursorPluginKey, true);
      view.dispatch(tr);
    };
    awareness.on('change', handleAwarenessChange);

    // Set up Yjs document observer for auto-save (only on LOCAL changes)
    const handleYjsUpdate = (_update: Uint8Array, origin: unknown) => {
      // Only save if the change originated locally (not from remote sync)
      if (origin !== session.provider) {
        scheduleSave();
      }
    };
    session.doc.on('update', handleYjsUpdate);

    // Cleanup on unmount
    return () => {
      // Cancel pending timers
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      clearTimeout(enableSaveTimer);
      // Reset for next mount
      isInitialLoadRef.current = true;
      // Remove event listeners
      view.dom.removeEventListener('blur', handleBlur);
      // Remove observers
      yText.unobserve(handleYTextChange);
      awareness.off('change', handleAwarenessChange);
      session.doc.off('update', handleYjsUpdate);
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
  }, [pagePath, userId, initialContent, handleStatusChange, handleUsersChange, scheduleSave]);

  // Combined status indicator - avatars + cloud icon
  const StatusBar = () => {
    const isConnected = connectionStatus === 'connected';
    const currentUserColor = userId ? stringToColor(userId) : '#888';
    const currentUserInitials = userId ? getInitials(userId) : '?';

    return (
      <div className="flex items-center gap-2">
        {/* All users avatars (current + remote) */}
        <div className="flex -space-x-1.5">
          {/* Current user */}
          <div
            className="w-5 h-5 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-medium text-white shadow-sm ring-1 ring-primary/30"
            style={{ backgroundColor: currentUserColor }}
            title="You"
          >
            {currentUserInitials}
          </div>
          {/* Remote users */}
          {remoteUsers.slice(0, 3).map((user) => (
            <div
              key={user.id}
              className="w-5 h-5 rounded-full border border-background flex items-center justify-center text-[9px] font-medium text-white shadow-sm"
              style={{ backgroundColor: user.color }}
              title={user.name}
            >
              {user.initials}
            </div>
          ))}
          {remoteUsers.length > 3 && (
            <div className="w-5 h-5 rounded-full border border-background bg-muted flex items-center justify-center text-[9px] font-medium shadow-sm">
              +{remoteUsers.length - 3}
            </div>
          )}
        </div>

        {/* Cloud status icon */}
        {!isConnected ? (
          <span title="Connecting..."><CloudOff className="h-4 w-4 text-muted-foreground animate-pulse" /></span>
        ) : saveStatus === 'saving' ? (
          <span title="Saving..."><CloudUpload className="h-4 w-4 text-blue-500 animate-pulse" /></span>
        ) : saveStatus === 'dirty' ? (
          <span title="Unsaved changes"><CloudUpload className="h-4 w-4 text-yellow-500" /></span>
        ) : (
          <span title="Saved"><Cloud className="h-4 w-4 text-green-500" /></span>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Toolbar with status indicators */}
      <div className="flex items-center justify-between border-b border-border px-2 py-1 bg-muted/30">
        <EditorToolbar editorView={editorView} />
        <StatusBar />
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        className="prosemirror-editor editable flex-1 overflow-auto"
      />
    </div>
  );
};

export default CollaborativeEditor;
