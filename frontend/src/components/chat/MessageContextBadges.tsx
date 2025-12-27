import React from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import type { ParsedSelection } from '../../utils/parseSelectionContext';
import { getSelectionFileName } from '../../utils/parseSelectionContext';

// Truncate text for preview
const truncateText = (text: string, maxLength: number = 500): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

interface MessageContextBadgesProps {
  selections: ParsedSelection[];
}

export const MessageContextBadges: React.FC<MessageContextBadgesProps> = ({ selections }) => {
  if (selections.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {selections.map((selection) => {
        const { id, source, content, lineCount } = selection;
        const lineLabel = lineCount === 1 ? 'line' : 'lines';
        const fileName = getSelectionFileName(source);

        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-pink-400 text-white shadow-md cursor-default transform hover:scale-105 transition-transform">
                <span className="font-medium">
                  {id} · {lineCount} {lineLabel}
                  {fileName && <span className="opacity-80 font-normal"> · {fileName}</span>}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="max-w-md max-h-64 overflow-auto font-mono text-xs bg-pink-400 text-white border-none shadow-lg p-3"
              arrowClassName="fill-pink-400"
            >
              {source && (
                <div className="text-pink-200 mb-2 pb-2 border-b border-pink-300/30">{source}</div>
              )}
              <pre className="whitespace-pre-wrap break-words">{truncateText(content)}</pre>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
};
