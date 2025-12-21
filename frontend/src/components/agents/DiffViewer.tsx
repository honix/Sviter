/**
 * DiffViewer - displays unified diff with basic syntax highlighting
 */

interface DiffViewerProps {
  diff: string;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  if (!diff || diff.trim() === '') {
    return (
      <div className="text-muted-foreground p-4 text-center border border-border rounded-md">
        No changes to display
      </div>
    );
  }

  const lines = diff.split('\n');

  const getLineClass = (line: string): string => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return 'text-muted-foreground font-semibold';
    }
    if (line.startsWith('+')) {
      return 'bg-primary/10 text-primary';
    }
    if (line.startsWith('-')) {
      return 'bg-destructive/10 text-destructive';
    }
    if (line.startsWith('@@')) {
      return 'text-accent-foreground bg-accent';
    }
    if (line.startsWith('diff --git')) {
      return 'text-primary font-semibold';
    }
    return 'text-foreground';
  };

  return (
    <div className="bg-muted/30 rounded-md border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <pre className="p-4 text-sm font-mono">
          {lines.map((line, index) => (
            <div
              key={index}
              className={`${getLineClass(line)} px-2 -mx-2`}
            >
              {line || ' '}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
