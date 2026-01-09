import React from 'react';
import { X } from 'lucide-react';
import { useSelection } from '../../contexts/SelectionContext';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

// Extract filename from path
const getFileName = (path: string): string => {
  const parts = path.split('/');
  return parts[parts.length - 1];
};

// Truncate text for preview
const truncateText = (text: string, maxLength: number = 500): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

export const SelectionBadge: React.FC = () => {
  const { state, removeContext } = useSelection();

  if (state.addedContexts.length === 0) return null;

  return (
    <div className="absolute -top-2.5 left-6 flex items-center gap-1 z-10">
      {state.addedContexts.map((context, index) => {
        const { text, lineCount, filePath } = context;
        const lineLabel = lineCount === 1 ? 'line' : 'lines';
        const fileName = filePath ? getFileName(filePath) : null;

        return (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <div
                data-testid="context-badge"
                className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-pink-400 text-white shadow-md cursor-default transform hover:scale-105 transition-transform"
              >
                <span className="font-medium">
                  #{index + 1} · {lineCount} {lineLabel}
                  {fileName && <span className="opacity-80 font-normal"> · {fileName}</span>}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeContext(index);
                  }}
                  className="ml-0.5 hover:bg-pink-600 rounded p-0.5 transition-colors"
                  title="Remove context"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-md max-h-64 overflow-auto font-mono text-xs bg-pink-400 text-white border-none shadow-lg p-3"
              arrowClassName="fill-pink-400"
            >
              {filePath && (
                <div className="text-pink-200 mb-2 pb-2 border-b border-pink-300/30">{filePath}</div>
              )}
              <pre className="whitespace-pre-wrap break-words">{truncateText(text)}</pre>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};
