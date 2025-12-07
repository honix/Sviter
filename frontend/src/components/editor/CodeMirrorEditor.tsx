/**
 * CodeMirrorEditor - Plain text/markdown editor using CodeMirror
 */
import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { cn } from '@/lib/utils';

interface CodeMirrorEditorProps {
  content: string;
  editable?: boolean;
  onChange?: (content: string) => void;
  className?: string;
}

export function CodeMirrorEditor({
  content,
  editable = true,
  onChange,
  className,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const isInternalChange = useRef(false);
  const initialContentRef = useRef(content);

  // Keep onChange ref updated
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    // Check if dark mode
    const isDark = document.documentElement.classList.contains('dark');

    const extensions = [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      EditorState.readOnly.of(!editable),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && editable) {
          isInternalChange.current = true;
          const newContent = update.state.doc.toString();
          onChangeRef.current?.(newContent);
        }
      }),
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '14px',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
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

    if (isDark) {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc: initialContentRef.current,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [editable]);

  // Update content when it changes externally (not from user typing)
  useEffect(() => {
    if (viewRef.current) {
      // Skip if this change came from the editor itself
      if (isInternalChange.current) {
        isInternalChange.current = false;
        return;
      }

      const currentContent = viewRef.current.state.doc.toString();
      if (content !== currentContent) {
        viewRef.current.dispatch({
          changes: {
            from: 0,
            to: currentContent.length,
            insert: content,
          },
        });
      }
    }
  }, [content]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'h-full overflow-hidden bg-background',
        className
      )}
    />
  );
}

export default CodeMirrorEditor;
