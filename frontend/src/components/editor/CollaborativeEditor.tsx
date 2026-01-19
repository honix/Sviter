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
import { tableEditing } from 'prosemirror-tables';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo as yUndo, redo as yRedo } from 'y-prosemirror';
import { useDroppable } from '@dnd-kit/core';
import { ImagePlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { schema, setCurrentPagePath } from '../../editor/schema';
import { createMermaidNodeView } from '../../editor/nodeviews/MermaidNodeView';
import { useAppDnd } from '../../contexts/DndContext';
import type { DragItemData } from '../../contexts/DndContext';
import { buildKeymap } from '../../editor/keymap';
import { markdownToProseMirror, prosemirrorToMarkdown } from '../../editor/conversion';
import { createCollabSession, destroyCollabSession, getXmlFragment, getSharedText, needsForceReinit, clearForceReinit, type CollabUser, type ConnectionStatus, type SaveStatus } from '../../services/collab';
import { uploadImage, isImageFile } from '../../services/upload-api';
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dropCursor, setDropCursor] = useState<{ top: number; left: number; height: number } | null>(null);
  const dropPosRef = useRef<number | null>(null);
  const dragCounterRef = useRef(0);
  const { userId, user } = useAuth();
  const sessionRef = useRef<ReturnType<typeof createCollabSession> | null>(null);
  const initializedRef = useRef(false);
  const editableRef = useRef(editable);
  editableRef.current = editable;

  // dnd-kit droppable for in-app drag from PageTree
  const { setNodeRef: setDroppableRef, isOver: isDndOver } = useDroppable({
    id: 'editor-drop-zone',
  });
  const { registerDropHandler, unregisterDropHandler, draggedItem } = useAppDnd();

  // Shared helper to update drop cursor from pointer coordinates
  const updateDropCursor = useCallback((clientX: number, clientY: number) => {
    if (!viewRef.current || !editorRef.current) return;
    const view = viewRef.current;
    const editorRect = editorRef.current.getBoundingClientRect();
    const pos = view.posAtCoords({ left: clientX, top: clientY });
    if (pos) {
      dropPosRef.current = pos.pos;
      const cursorCoords = view.coordsAtPos(pos.pos);
      if (cursorCoords) {
        setDropCursor({
          top: cursorCoords.top - editorRect.top,
          left: cursorCoords.left - editorRect.left,
          height: cursorCoords.bottom - cursorCoords.top || 20,
        });
      }
    }
  }, []);

  // Track pointer position during dnd-kit drags for drop cursor
  // Use global listener because dnd-kit captures pointer events
  useEffect(() => {
    if (!isDndOver || !draggedItem || !editable) {
      setDropCursor(null);
      dropPosRef.current = null;
      return;
    }

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (!editorRef.current) return;
      const editorRect = editorRef.current.getBoundingClientRect();
      // Check if pointer is within editor bounds
      if (
        e.clientX >= editorRect.left &&
        e.clientX <= editorRect.right &&
        e.clientY >= editorRect.top &&
        e.clientY <= editorRect.bottom
      ) {
        updateDropCursor(e.clientX, e.clientY);
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove);
    return () => window.removeEventListener('pointermove', handleGlobalPointerMove);
  }, [isDndOver, draggedItem, editable, updateDropCursor]);

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

  // Insert image node at cursor position or specified drop position
  const insertImageNode = useCallback((src: string, alt: string, dropPos?: number | null) => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { state, dispatch } = view;

    // Use drop position if provided, otherwise use current selection
    const pos = dropPos ?? state.selection.from;
    const $pos = state.doc.resolve(pos);
    const parent = $pos.parent;

    const imageNode = schema.nodes.image.create({ src, alt });

    // If inside a heading, insert a new paragraph with the image after it
    if (parent.type.name === 'heading') {
      const endOfHeading = $pos.after();
      const paragraphWithImage = schema.nodes.paragraph.create(null, imageNode);
      const tr = state.tr.insert(endOfHeading, paragraphWithImage);
      dispatch(tr);
    } else if (parent.type.name === 'paragraph' || parent.type.name === 'list_item') {
      // Normal case - insert at position
      const tr = state.tr.insert(pos, imageNode);
      dispatch(tr);
    } else {
      // For other block types, wrap in a paragraph
      const paragraphWithImage = schema.nodes.paragraph.create(null, imageNode);
      const tr = state.tr.insert(pos, paragraphWithImage);
      dispatch(tr);
    }
    view.focus();
  }, []);

  // Insert link node at cursor position or specified drop position
  const insertLinkNode = useCallback((href: string, title: string, dropPos?: number | null) => {
    if (!viewRef.current) return;
    const view = viewRef.current;
    const { state, dispatch } = view;
    const linkMark = schema.marks.link.create({ href });
    const textNode = schema.text(title, [linkMark]);

    // Use drop position if provided, otherwise replace selection
    if (dropPos != null) {
      const tr = state.tr.insert(dropPos, textNode);
      dispatch(tr);
    } else {
      const tr = state.tr.replaceSelectionWith(textNode);
      dispatch(tr);
    }
    view.focus();
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback(async (files: FileList, dropPos?: number | null) => {
    if (!editable || !viewRef.current) return;

    const imageFiles = Array.from(files).filter(isImageFile);
    if (imageFiles.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of imageFiles) {
        const result = await uploadImage(file);
        insertImageNode(result.path, file.name.replace(/\.[^.]+$/, ''), dropPos);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [editable, insertImageNode]);

  // Drag event handlers
  // Native drag handlers - only for OS file drops (dnd-kit handles in-app drags)
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    // Only show overlay for native file drops (not dnd-kit)
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
      setDropCursor(null);
      dropPosRef.current = null;
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editable) {
      updateDropCursor(e.clientX, e.clientY);
    }
  }, [editable, updateDropCursor]);

  // Native drop handler - only for OS file uploads (dnd-kit handles in-app drags)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    setDropCursor(null);

    const dropPos = dropPosRef.current;
    dropPosRef.current = null;

    if (!editable) return;

    // Handle file drop from OS
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files, dropPos);
    }
  }, [editable, handleFileUpload]);

  // Set current page path for relative image URL resolution (GitHub-style)
  useEffect(() => {
    setCurrentPagePath(pagePath);
  }, [pagePath]);

  // Handle dnd-kit drop from PageTree
  const handleDndDrop = useCallback((item: DragItemData) => {
    if (!editable || !viewRef.current) return;

    // Use tracked drop position or fall back to cursor position
    const pos = dropPosRef.current ?? viewRef.current.state.selection.from;

    if (item.type === 'image') {
      insertImageNode(item.path, item.name, pos);
    } else if (item.type === 'page') {
      insertLinkNode(`/${item.path}`, item.name, pos);
    }

    // Clear drop cursor
    setDropCursor(null);
    dropPosRef.current = null;
  }, [editable, insertImageNode, insertLinkNode]);

  // Register drop handler with dnd context
  useEffect(() => {
    registerDropHandler('editor-drop-zone', handleDndDrop);
    return () => unregisterDropHandler('editor-drop-zone');
  }, [registerDropHandler, unregisterDropHandler, handleDndDrop]);

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
      user?.name,
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
      let forceReinit = needsForceReinit(pagePath);
      if (forceReinit) {
        console.log(`Force reinitializing ${pagePath} due to external content change`);
      }

      // Also check if Y.Text content differs from initialContent (indicates stale data)
      const yText = getSharedText(session.doc);
      const currentYTextContent = yText.toString();
      if (!forceReinit && yXmlFragment.length > 0 && initialContent) {
        // If Y.Text is empty but XmlFragment has content, something is wrong
        // Or if Y.Text differs significantly from initialContent
        if (currentYTextContent.length === 0 ||
            (currentYTextContent !== initialContent && currentYTextContent.length < initialContent.length * 0.5)) {
          console.log(`Content mismatch detected for ${pagePath}, forcing reinit`);
          console.log(`Y.Text length: ${currentYTextContent.length}, initialContent length: ${initialContent.length}`);
          forceReinit = true;
        }
      }

      // Determine if we need to initialize content
      const needsInit = yXmlFragment.length === 0 || forceReinit;

      if (forceReinit) {
        // Clear the force reinit flag early
        clearForceReinit(pagePath);
      }

      if (cancelled || !editorRef.current) return;

      // Create editor state with y-prosemirror plugins
      const state = EditorState.create({
        schema,
        plugins: [
          ySyncPlugin(yXmlFragment),
          yCursorPlugin(awareness, { cursorBuilder }),
          yUndoPlugin(),
          tableEditing(),            // Table editing behavior (cell selection, navigation)
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

      // Create editor view with mermaid NodeView
      view = new EditorView(editorRef.current, {
        state,
        editable: () => editableRef.current,
        nodeViews: {
          code_block: createMermaidNodeView(() => editableRef.current),
        },
      });

      viewRef.current = view;
      setEditorView(view);
      initializedRef.current = true;

      // Initialize content using ProseMirror transaction (lets ySyncPlugin handle XmlFragment format)
      if (needsInit && initialContent) {
        console.log(`Initializing content for ${pagePath} via ProseMirror transaction`);
        const newDoc = markdownToProseMirror(initialContent);
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
        view.dispatch(tr);

        // Also initialize Y.Text for Raw mode
        isSyncing = true;
        session.doc.transact(() => {
          yText.delete(0, yText.length);
          yText.insert(0, initialContent);
        }, 'init');
        isSyncing = false;
        console.log(`Initialized Y.Text for ${pagePath}`);
      } else {
        console.log(`XmlFragment already has ${yXmlFragment.length} nodes for ${pagePath}`);

        // Check if XmlFragment content matches Y.Text - if not, fix via ProseMirror transaction
        const yTextContent = yText.toString();
        const renderedMarkdown = prosemirrorToMarkdown(view.state.doc);
        if (yTextContent && renderedMarkdown !== yTextContent) {
          console.log(`Content mismatch detected after editor init for ${pagePath}`);
          console.log(`Y.Text length: ${yTextContent.length}, rendered length: ${renderedMarkdown.length}`);
          // Fix by replacing document content via ProseMirror (ySyncPlugin syncs to XmlFragment)
          const newDoc = markdownToProseMirror(yTextContent);
          const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
          view.dispatch(tr);
          console.log(`Fixed content from Y.Text for ${pagePath}`);
        }
      }

      // Observe XmlFragment changes to sync to Y.Text (only for LOCAL changes)
      yXmlFragment.observeDeep((_events, transaction) => {
        if (isSyncing) return; // Skip if we're in a sync operation
        // Skip remote changes - they already have Y.Text synced
        if (transaction.origin === session.provider || transaction.origin === 'y-sync') return;
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(syncToYText, 500);
      });

      // Also observe Y.Text changes (from Raw mode) to sync back to XmlFragment
      const syncFromYText = () => {
        if (isSyncing || !view) return; // Skip if already syncing or no view

        const markdownContent = yText.toString();
        if (!markdownContent) return;

        // Convert markdown to ProseMirror doc and compare
        const newDoc = markdownToProseMirror(markdownContent);
        const currentMarkdown = prosemirrorToMarkdown(view.state.doc);

        // Only sync if content actually differs
        if (currentMarkdown === markdownContent) return;

        isSyncing = true;
        // Use ProseMirror transaction - ySyncPlugin will handle XmlFragment sync
        const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, newDoc.content);
        view.dispatch(tr);
        isSyncing = false;

        console.log(`Synced Y.Text → ProseMirror for ${pagePath}`);
      };

      yText.observe((_event, transaction) => {
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
  const { handleClick, handleMouseOver } = useWikiLinks(onLinkClick, editable, pagePath);

  return (
    <div className={`flex flex-col h-full ${className || ''}`}>
      {/* Toolbar - only show when editable */}
      {editable && (
        <div className="flex items-center border-b border-border px-2 py-1 bg-muted/30">
          <EditorToolbar editorView={editorView} />
        </div>
      )}

      {/* Editor with drag-drop zone */}
      <div
        ref={setDroppableRef}
        className="relative flex-1 min-h-0"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div
          ref={editorRef}
          onClick={handleClick}
          onMouseOver={handleMouseOver}
          className={`prosemirror-editor h-full overflow-auto ${editable ? 'editable' : 'readonly'}`}
        />

        {/* Drag overlay - show for both native and dnd-kit drags */}
        {(isDragOver || isDndOver) && editable && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-lg flex items-center justify-center z-50 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-primary">
              <ImagePlus className="h-12 w-12" />
              <span className="text-lg font-medium">Drop to insert</span>
            </div>
          </div>
        )}

        {/* Upload spinner */}
        {isUploading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-50 pointer-events-none">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Drop cursor indicator */}
        {dropCursor && editable && (
          <div
            className="absolute w-0.5 bg-primary z-50 pointer-events-none"
            style={{
              top: dropCursor.top,
              left: dropCursor.left,
              height: dropCursor.height,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default CollaborativeEditor;
