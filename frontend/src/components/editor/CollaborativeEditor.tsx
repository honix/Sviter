/**
 * Collaborative ProseMirror editor using Yjs for real-time synchronization.
 * This component manages the Yjs document and binds it to ProseMirror.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, emDash, ellipsis } from 'prosemirror-inputrules';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo, prosemirrorJSONToYXmlFragment } from 'y-prosemirror';

import { schema } from '../../editor/schema';
import { buildKeymap } from '../../editor/keymap';
import { markdownToProseMirror, prosemirrorToMarkdown } from '../../editor/conversion';
import { createCollabSession, destroyCollabSession, getXmlFragment, type CollabUser, type ConnectionStatus } from '../../services/collab';
import { updatePage } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { EditorToolbar } from './EditorToolbar';
import { Cloud, CloudOff, CloudUpload } from 'lucide-react';
import { stringToColor, getInitials } from '../../utils/colors';

// Debounce delay for auto-save (milliseconds)
const SAVE_DEBOUNCE_MS = 2000;
import './prosemirror.css';

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
  const isInitialLoadRef = useRef(true); // Skip save on initial load

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
    if (!viewRef.current) return;

    const markdown = prosemirrorToMarkdown(viewRef.current.state.doc);

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

    // Get Yjs XML fragment for ProseMirror
    const yXmlFragment = getXmlFragment(session.doc);

    // Initialize content after a short delay to allow for sync
    // This gives time for existing content to arrive from other clients
    setTimeout(() => {
      if (yXmlFragment.length === 0 && initialContent) {
        // Parse markdown to ProseMirror document
        const doc = markdownToProseMirror(initialContent);

        // Convert ProseMirror doc to Yjs XmlFragment
        // This populates the shared Y.XmlFragment with the ProseMirror content
        prosemirrorJSONToYXmlFragment(schema, doc.toJSON(), yXmlFragment);
      }
    }, 100); // Small delay to allow sync

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

    // Custom cursor builder for better cursor styling
    const cursorBuilder = (user: { name?: string; color?: string }) => {
      const cursor = document.createElement('span');
      cursor.classList.add('collaboration-cursor');
      cursor.setAttribute('data-user', user.name || 'Anonymous');
      const color = user.color || '#6495ED';
      cursor.style.setProperty('--cursor-color', color);
      cursor.style.borderLeftColor = color;
      return cursor;
    };

    // Create editor state with Yjs plugins
    const state = EditorState.create({
      schema,
      plugins: [
        ySyncPlugin(yXmlFragment),
        yCursorPlugin(session.provider.awareness, { cursorBuilder }),
        yUndoPlugin(),
        keymap({
          'Mod-z': undo,
          'Mod-y': redo,
          'Mod-Shift-z': redo,
        }),
        buildKeymap(),
        keymap(baseKeymap),
        buildInputRulesPlugin(),
      ],
    });

    // Create editor view
    const view = new EditorView(editorRef.current, {
      state,
      editable: () => true,
    });

    viewRef.current = view;
    setEditorView(view);
    initializedRef.current = true;

    // Store initial content for comparison
    lastSavedContentRef.current = initialContent;

    // Allow saves after initial load settles (longer than content init delay)
    const enableSaveTimer = setTimeout(() => {
      isInitialLoadRef.current = false;
    }, 500);

    // Set up Yjs document observer for auto-save (only on LOCAL changes)
    const handleYjsUpdate = (_update: Uint8Array, origin: any) => {
      // Only save if the change originated locally (not from remote sync)
      // Remote synced changes have origin === WebsocketProvider
      // Local changes have other origins (ySyncPlugin, null, etc.)
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
      // Remove Yjs observer
      session.doc.off('update', handleYjsUpdate);
      view.destroy();
      viewRef.current = null;
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
          <CloudOff className="h-4 w-4 text-muted-foreground animate-pulse" title="Connecting..." />
        ) : saveStatus === 'saving' ? (
          <CloudUpload className="h-4 w-4 text-blue-500 animate-pulse" title="Saving..." />
        ) : saveStatus === 'dirty' ? (
          <CloudUpload className="h-4 w-4 text-yellow-500" title="Unsaved changes" />
        ) : (
          <Cloud className="h-4 w-4 text-green-500" title="Saved" />
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
