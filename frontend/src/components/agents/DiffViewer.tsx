/**
 * DiffViewer - displays unified diff with basic syntax highlighting
 */
import React from 'react';

interface DiffViewerProps {
  diff: string;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  if (!diff || diff.trim() === '') {
    return (
      <div className="text-gray-400 p-4 text-center">
        No changes to display
      </div>
    );
  }

  const lines = diff.split('\n');

  const getLineClass = (line: string): string => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return 'text-gray-400 font-semibold';
    }
    if (line.startsWith('+')) {
      return 'bg-green-900/30 text-green-200';
    }
    if (line.startsWith('-')) {
      return 'bg-red-900/30 text-red-200';
    }
    if (line.startsWith('@@')) {
      return 'text-blue-400 bg-blue-900/20';
    }
    if (line.startsWith('diff --git')) {
      return 'text-purple-400 font-semibold';
    }
    return 'text-gray-300';
  };

  return (
    <div className="bg-gray-950 rounded-lg border border-gray-800 overflow-hidden">
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
