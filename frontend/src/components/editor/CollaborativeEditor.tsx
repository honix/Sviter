/**
 * Collaborative ProseMirror editor using y-prosemirror for real-time synchronization.
 * Uses Y.XmlFragment for accurate cursor synchronization.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
// Using y-prosemirror's undo/redo instead of prosemirror-history
import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, emDash, ellipsis } from 'prosemirror-inputrules';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo as yUndo, redo as yRedo } from 'y-prosemirror';
import * as Y from 'yjs';

import { schema } from '../../editor/schema';
import { buildKeymap } from '../../editor/keymap';
import { markdownToProseMirror, prosemirrorToMarkdown } from '../../editor/conversion';
import { createCollabSession, destroyCollabSession, getXmlFragment, getSharedText, needsForceReinit, clearForceReinit, type CollabUser, type ConnectionStatus, type SaveStatus } from '../../services/collab';
import { useAuth } from '../../contexts/AuthContext';
import { EditorToolbar } from './EditorToolbar';
import { useWikiLinks } from '../../hooks/useWikiLinks';

import './prosemirror.css';

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
  onLinkClick?: (href: string) => void;
}

export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  pagePath,
  pageTitle,
  initialContent,
  className,
  editable = true,
  onCollabStatusChange,
  onLinkClick,
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

  // Handle save status changes
  const handleSaveStatusChange = useCallback((status: SaveStatus) => {
    setSaveStatus(status);
  }, []);

  // Initialize editor with y-prosemirror
  useEffect(() => {
    if (!editorRef.current || !userId || initializedRef.current) return;

    let cancelled = false;
    let view: EditorView | null = null;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    let reverseTimer: ReturnType<typeof setTimeout> | null = null;
    let isSyncing = false; // Lock to prevent sync feedback loops

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

    // Get Y.XmlFragment for y-prosemirror binding
    const yXmlFragment = getXmlFragment(session.doc);
    const awareness = session.provider.awareness;

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

    // Custom cursor builder for y-prosemirror
    const cursorBuilder = (user: { name: string; color: string }) => {
      const cursor = document.createElement('span');
      cursor.className = 'collaboration-cursor-widget';
      cursor.style.borderLeft = `2px solid ${user.color}`;

      const label = document.createElement('span');
      label.className = 'collaboration-cursor-label';
      label.textContent = user.name;
      label.style.backgroundColor = user.color;

      cursor.appendChild(label);
      return cursor;
    };

    // Sync XmlFragment changes to Y.Text for saving (markdown format)
    const syncToYText = () => {
      if (isSyncing) return; // Skip if already syncing
      const yText = getSharedText(session.doc);
      if (view?.state.doc) {
        const markdown = prosemirrorToMarkdown(view.state.doc);
        if (yText.toString() !== markdown) {
          isSyncing = true;
          session.doc.transact(() => {
            yText.delete(0, yText.length);
            yText.insert(0, markdown);
          }, 'prosemirror-sync');
          isSyncing = false;
        }
      }
    };

    // Wait for sync to complete, then initialize editor
    const initializeEditor = async () => {
      // Wait for WebSocket sync
      if (!session.provider.synced) {
        await new Promise<void>((resolve) => {
          const handleSync = (synced: boolean) => {
            if (synced) {
              session.provider.off('sync', handleSync);
              resolve();
            }
          };
          session.provider.on('sync', handleSync);
          // Fallback timeout
          setTimeout(() => {
            session.provider.off('sync', handleSync);
            resolve();
          }, 3000);
        });
      }

      if (cancelled) return;

      // Check if we need forced reinitialization (e.g., after thread merge)
      const forceReinit = needsForceReinit(pagePath);
      if (forceReinit) {
        console.log(`Force reinitializing ${pagePath} due to external content change`);
      }

      // Initialize XmlFragment from markdown if empty OR if forced reinit
      if ((yXmlFragment.length === 0 || forceReinit) && initialContent) {
        isSyncing = true; // Prevent observers from firing during init
        const doc = markdownToProseMirror(initialContent);
        session.doc.transact(() => {
          // Clear existing content if force reinit
          if (forceReinit && yXmlFragment.length > 0) {
            while (yXmlFragment.length > 0) {
              yXmlFragment.delete(0, 1);
            }
          }
          insertProseMirrorContent(yXmlFragment, doc);
        }, 'init');
        console.log(`Initialized XmlFragment for ${pagePath}`);

        // Also initialize Y.Text immediately so Raw mode has content
        const yText = getSharedText(session.doc);
        session.doc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, initialContent);
        }, 'init');
        console.log(`Initialized Y.Text for ${pagePath}`);

        isSyncing = false;

        // Clear the force reinit flag
        if (forceReinit) {
          clearForceReinit(pagePath);
        }
      } else {
        console.log(`XmlFragment already has ${yXmlFragment.length} nodes for ${pagePath}`);
      }

      if (cancelled || !editorRef.current) return;

      // Create editor state with y-prosemirror plugins
      const state = EditorState.create({
        schema,
        plugins: [
          ySyncPlugin(yXmlFragment),
          yCursorPlugin(awareness, { cursorBuilder }),
          yUndoPlugin(),
          keymap({
            'Mod-z': yUndo,
            'Mod-y': yRedo,
            'Mod-Shift-z': yRedo,
          }),
          buildKeymap(),
          keymap(baseKeymap),
          buildInputRulesPlugin(),
        ],
      });

      // Create editor view
      view = new EditorView(editorRef.current, {
        state,
        editable: () => editableRef.current,
      });

      viewRef.current = view;
      setEditorView(view);
      initializedRef.current = true;

      // Observe XmlFragment changes to sync to Y.Text (only for LOCAL changes)
      yXmlFragment.observeDeep((events, transaction) => {
        if (isSyncing) return; // Skip if we're in a sync operation
        // Skip remote changes - they already have Y.Text synced
        if (transaction.origin === session.provider || transaction.origin === 'y-sync') return;
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(syncToYText, 500);
      });

      // Also observe Y.Text changes (from Raw mode) to sync back to XmlFragment
      const yText = getSharedText(session.doc);

      const syncFromYText = () => {
        if (isSyncing) return; // Skip if already syncing

        const markdownContent = yText.toString();
        if (!markdownContent) return;

        // Convert markdown to ProseMirror doc and compare
        const newDoc = markdownToProseMirror(markdownContent);
        const currentMarkdown = view ? prosemirrorToMarkdown(view.state.doc) : '';

        // Only sync if content actually differs
        if (currentMarkdown === markdownContent) return;

        isSyncing = true;
        // Clear and rebuild XmlFragment
        session.doc.transact(() => {
          // Clear existing content
          while (yXmlFragment.length > 0) {
            yXmlFragment.delete(0, 1);
          }
          // Insert new content
          insertProseMirrorContent(yXmlFragment, newDoc);
        }, 'codemirror-sync');
        isSyncing = false;

        console.log(`Synced Y.Text → XmlFragment for ${pagePath}`);
      };

      yText.observe((event, transaction) => {
        // Skip our own changes and remote changes
        if (isSyncing) return;
        if (transaction.origin === 'prosemirror-sync' || transaction.origin === 'codemirror-sync' || transaction.origin === 'init') return;
        // Skip remote changes - they already have XmlFragment synced
        if (transaction.origin === session.provider || transaction.origin === 'y-sync') return;

        if (reverseTimer) clearTimeout(reverseTimer);
        reverseTimer = setTimeout(syncFromYText, 500);
      });
    };

    initializeEditor();

    // Cleanup on unmount
    return () => {
      cancelled = true;
      if (syncTimer) clearTimeout(syncTimer);
      if (reverseTimer) clearTimeout(reverseTimer);
      if (view) {
        view.destroy();
        viewRef.current = null;
        setEditorView(null);
      }
      initializedRef.current = false;
      destroyCollabSession(pagePath);
      sessionRef.current = null;
    };
  }, [pagePath, userId, initialContent, handleStatusChange, handleUsersChange, handleSaveStatusChange, pageTitle]);

  // Notify parent of status changes
  useEffect(() => {
    if (onCollabStatusChange) {
      onCollabStatusChange({ connectionStatus, remoteUsers, saveStatus });
    }
  }, [connectionStatus, remoteUsers, saveStatus, onCollabStatusChange]);

  // Wiki link handling
  const { handleClick, handleMouseOver } = useWikiLinks(onLinkClick, editable);

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
        onClick={handleClick}
        onMouseOver={handleMouseOver}
        className={`prosemirror-editor flex-1 overflow-auto ${editable ? 'editable' : 'readonly'}`}
      />
    </div>
  );
};

/**
 * Insert ProseMirror document content into Y.XmlFragment.
 * This converts the ProseMirror node tree to Y.XmlElement/Y.XmlText nodes.
 */
function insertProseMirrorContent(yXmlFragment: Y.XmlFragment, doc: ReturnType<typeof markdownToProseMirror>): void {
  doc.content.forEach((node) => {
    const yNode = prosemirrorNodeToYXml(node);
    if (yNode) {
      yXmlFragment.push([yNode]);
    }
  });
}

/**
 * Convert a ProseMirror node to Y.XmlElement or Y.XmlText.
 */
function prosemirrorNodeToYXml(node: any): Y.XmlElement | Y.XmlText | null {
  if (node.isText) {
    const yText = new Y.XmlText();
    yText.insert(0, node.text || '');
    // Add marks as attributes if needed
    if (node.marks && node.marks.length > 0) {
      node.marks.forEach((mark: any) => {
        yText.format(0, node.text?.length || 0, { [mark.type.name]: mark.attrs || true });
      });
    }
    return yText;
  }

  if (node.type && node.type.name) {
    const yElement = new Y.XmlElement(node.type.name);

    // Set attributes
    if (node.attrs) {
      Object.entries(node.attrs).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          yElement.setAttribute(key, value as string);
        }
      });
    }

    // Add children
    if (node.content) {
      node.content.forEach((child: any) => {
        const yChild = prosemirrorNodeToYXml(child);
        if (yChild) {
          yElement.push([yChild]);
        }
      });
    }

    return yElement;
  }

  return null;
}

export default CollaborativeEditor;
