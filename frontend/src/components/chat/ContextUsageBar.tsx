import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

interface ContextUsageBarProps {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  contextLimit: number;
  contextPercent: number;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function getUsageColor(percent: number): string {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

export function ContextUsageBar({
  promptTokens,
  completionTokens,
  totalTokens,
  contextLimit,
  contextPercent
}: ContextUsageBarProps) {
  // Calculate percentage based on total tokens, not just input
  const totalPercent = contextLimit > 0 ? (totalTokens / contextLimit) * 100 : 0;
  const barColor = getUsageColor(totalPercent);

  return (
    <div className="px-4 py-2 border-t border-border flex-shrink-0 bg-background">
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-3 text-xs cursor-help">
            <span className="text-muted-foreground whitespace-nowrap">Context</span>
            <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className={`h-full ${barColor} transition-all duration-300`}
                style={{ width: `${Math.min(totalPercent, 100)}%` }}
              />
            </div>
            <span className="font-mono text-muted-foreground whitespace-nowrap">
              {formatTokens(totalTokens)} / {formatTokens(contextLimit)}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="space-y-1">
            <div>Input: {promptTokens.toLocaleString()} tokens</div>
            <div>Output: {completionTokens.toLocaleString()} tokens</div>
            <div>Total: {totalTokens.toLocaleString()} tokens</div>
            <div>Limit: {contextLimit.toLocaleString()} tokens</div>
            <div>Usage: {totalPercent.toFixed(1)}%</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
