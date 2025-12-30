import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { inputRules, wrappingInputRule, textblockTypeInputRule, smartQuotes, emDash, ellipsis } from 'prosemirror-inputrules';
import { schema } from '../../editor/schema';
import { markdownToProseMirror, prosemirrorToMarkdown } from '../../editor/conversion';
import { buildKeymap } from '../../editor/keymap';
import { useWikiLinks } from '../../hooks/useWikiLinks';
import './prosemirror.css';

interface ProseMirrorEditorProps {
  initialContent: string; // Markdown string
  onChange?: (doc: any, markdown: string) => void;
  onViewReady?: (view: EditorView) => void;
  onLinkClick?: (href: string) => void; // Handle wiki link clicks
  editable: boolean;
  className?: string;
}

export interface ProseMirrorEditorHandle {
  getView: () => EditorView | null;
}

export const ProseMirrorEditor = forwardRef<ProseMirrorEditorHandle, ProseMirrorEditorProps>(
  ({ initialContent, onChange, onViewReady, onLinkClick, editable, className }, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const initializedRef = useRef(false);

    // Expose the EditorView to parent components
    useImperativeHandle(ref, () => ({
      getView: () => viewRef.current,
    }));

    // Initialize editor
    useEffect(() => {
      if (!editorRef.current || initializedRef.current) return;

      // Parse initial markdown to ProseMirror document
      const doc = markdownToProseMirror(initialContent);

      // Create input rules for markdown shortcuts
      const buildInputRules = () => {
        const rules = [
          // Heading input rules: ## → H2
          textblockTypeInputRule(/^#\s$/, schema.nodes.heading, { level: 1 }),
          textblockTypeInputRule(/^##\s$/, schema.nodes.heading, { level: 2 }),
          textblockTypeInputRule(/^###\s$/, schema.nodes.heading, { level: 3 }),

          // Bullet list: - or * at start
          wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),

          // Ordered list: 1. at start
          wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list),

          // Code block: ``` at start
          textblockTypeInputRule(/^```$/, schema.nodes.code_block),

          // Smart quotes and other replacements
          ...smartQuotes,
          ellipsis,
          emDash,
        ];
        return inputRules({ rules });
      };

      // Create editor state
      const state = EditorState.create({
        doc,
        plugins: [
          history(),
          buildKeymap(),         // Custom keybindings (Ctrl+B, etc.)
          keymap(baseKeymap),    // Base ProseMirror keybindings
          buildInputRules(),     // Markdown shortcuts (## → heading)
        ],
      });

      // Create editor view
      const view = new EditorView(editorRef.current, {
        state,
        editable: () => editable,
        dispatchTransaction(transaction: Transaction) {
          const newState = view.state.apply(transaction);
          view.updateState(newState);

          // Call onChange if document changed
          if (transaction.docChanged && onChange) {
            const markdown = prosemirrorToMarkdown(newState.doc);
            onChange(newState.doc.toJSON(), markdown);
          }
        },
      });

      viewRef.current = view;
      initializedRef.current = true;

      // Notify parent that view is ready
      if (onViewReady) {
        onViewReady(view);
      }

      // Cleanup
      return () => {
        view.destroy();
        viewRef.current = null;
        initializedRef.current = false;
      };
    }, []); // Only run once on mount

    // Update editable state when prop changes
    useEffect(() => {
      if (viewRef.current) {
        // Force update to apply new editable state
        viewRef.current.setProps({ editable: () => editable });
      }
    }, [editable]);

    // Update content when initialContent changes (page navigation)
    useEffect(() => {
      if (viewRef.current && initializedRef.current) {
        const currentDoc = viewRef.current.state.doc;
        const newDoc = markdownToProseMirror(initialContent);

        // Only update if content actually changed
        if (!currentDoc.eq(newDoc)) {
          const newState = EditorState.create({
            doc: newDoc,
            plugins: viewRef.current.state.plugins,
          });
          viewRef.current.updateState(newState);
        }
      }
    }, [initialContent]);

    // Wiki link handling
    const { handleClick, handleMouseOver } = useWikiLinks(onLinkClick, editable);

    return (
      <div
        ref={editorRef}
        onClick={handleClick}
        onMouseOver={handleMouseOver}
        className={`prosemirror-editor ${editable ? 'editable' : 'readonly'} ${className || ''}`}
      />
    );
  }
);

ProseMirrorEditor.displayName = 'ProseMirrorEditor';
