/**
 * CodeMirrorEditor - Plain text/markdown editor using CodeMirror
 */
import { useEffect, useRef, useCallback } from 'react';
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
  const contentRef = useRef(content);

  // Update content ref
  contentRef.current = content;

  const handleChange = useCallback(() => {
    if (viewRef.current && onChange) {
      const newContent = viewRef.current.state.doc.toString();
      onChange(newContent);
    }
  }, [onChange]);

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
          handleChange();
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
      doc: contentRef.current,
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
  }, [editable, handleChange]);

  // Update content when it changes externally
  useEffect(() => {
    if (viewRef.current) {
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
        'h-full overflow-hidden bg-background border rounded-md',
        className
      )}
    />
  );
}

export default CodeMirrorEditor;
