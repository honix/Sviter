/**
 * CodeMirrorDiffView - Single pane diff view with highlighted changes
 */
import { useEffect, useRef, useState, useMemo } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { diffLines } from 'diff';
import { cn } from '@/lib/utils';

interface CodeMirrorDiffViewProps {
  currentContent: string;
  pagePath: string;
  className?: string;
}

// Create line decorations for diff
const addedLine = Decoration.line({ class: 'cm-diff-added' });
const removedLine = Decoration.line({ class: 'cm-diff-removed' });

export function CodeMirrorDiffView({
  currentContent,
  pagePath,
  className,
}: CodeMirrorDiffViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [mainContent, setMainContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch main branch content
  useEffect(() => {
    setLoading(true);

    fetch(`http://localhost:8000/api/pages/${encodeURIComponent(pagePath)}/at-ref?ref=main`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch');
        return r.json();
      })
      .then(data => {
        setMainContent(data.content || '');
        setLoading(false);
      })
      .catch(() => {
        setMainContent('');
        setLoading(false);
      });
  }, [pagePath]);

  // Compute unified diff content with markers
  const { diffContent, lineTypes } = useMemo(() => {
    if (mainContent === null) {
      return { diffContent: currentContent, lineTypes: new Map<number, 'added' | 'removed'>() };
    }

    const changes = diffLines(mainContent, currentContent);
    const lines: string[] = [];
    const types = new Map<number, 'added' | 'removed'>();

    for (const change of changes) {
      const changeLines = change.value.replace(/\n$/, '').split('\n');

      for (const line of changeLines) {
        if (change.added) {
          types.set(lines.length, 'added');
          lines.push(line);
        } else if (change.removed) {
          types.set(lines.length, 'removed');
          lines.push(line);
        } else {
          lines.push(line);
        }
      }
    }

    return { diffContent: lines.join('\n'), lineTypes: types };
  }, [mainContent, currentContent]);

  // Create editor when content is ready
  useEffect(() => {
    if (!containerRef.current || mainContent === null) return;

    const isDark = document.documentElement.classList.contains('dark');

    // Create decorations based on line types
    function createDecorations(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();

      for (let i = 1; i <= view.state.doc.lines; i++) {
        const lineType = lineTypes.get(i - 1);
        if (lineType) {
          const line = view.state.doc.line(i);
          builder.add(line.from, line.from, lineType === 'added' ? addedLine : removedLine);
        }
      }

      return builder.finish();
    }

    const diffPlugin = ViewPlugin.fromClass(class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = createDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = createDecorations(update.view);
        }
      }
    }, {
      decorations: v => v.decorations
    });

    const extensions = [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      EditorState.readOnly.of(true),
      diffPlugin,
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
        '.cm-diff-added': {
          backgroundColor: 'rgba(34, 197, 94, 0.15)',
          borderLeft: '3px solid rgb(34, 197, 94)',
        },
        '.cm-diff-removed': {
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          borderLeft: '3px solid rgb(239, 68, 68)',
          textDecoration: 'line-through',
          opacity: '0.7',
        },
      }),
    ];

    if (isDark) {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc: diffContent,
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
  }, [mainContent, diffContent, lineTypes]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center h-full text-muted-foreground", className)}>
        Loading diff...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("h-full overflow-hidden bg-background", className)}
    />
  );
}

export default CodeMirrorDiffView;
