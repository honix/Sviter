/**
 * ThreadChangesView - displays file changes for a thread
 * V1: Simple file summary + expandable diff view
 */
import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, FilePlus, FileEdit, Trash2 } from 'lucide-react';
import { GitAPI } from '../../services/git-api';
import { DiffViewer } from '../agents/DiffViewer';
import { cn } from '@/lib/utils';
import type { ThreadDiffStats } from '../../types/thread';

interface ThreadChangesViewProps {
  branch: string;
  baseBranch?: string;
  className?: string;
  compact?: boolean;  // If true, show minimal view
}

export function ThreadChangesView({
  branch,
  baseBranch = 'main',
  className,
  compact = false
}: ThreadChangesViewProps) {
  const [stats, setStats] = useState<ThreadDiffStats | null>(null);
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDiffData();
  }, [branch, baseBranch]);

  const loadDiffData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [diffText, statsData] = await Promise.all([
        GitAPI.getBranchDiff(baseBranch, branch),
        GitAPI.getBranchDiffStats(baseBranch, branch),
      ]);

      // Convert to ThreadDiffStats format
      const threadStats: ThreadDiffStats = {
        files_changed: statsData.files_changed?.length || 0,
        lines_added: 0,
        lines_removed: 0,
        files: statsData.files_changed?.map((f: { path: string; changes: string }) => {
          // Parse changes like "+10 -5" into lines_added and lines_removed
          const matches = f.changes.match(/\+(\d+)\s+-(\d+)/);
          const added = matches ? parseInt(matches[1], 10) : 0;
          const removed = matches ? parseInt(matches[2], 10) : 0;
          return {
            path: f.path,
            lines_added: added,
            lines_removed: removed
          };
        }) || []
      };

      // Calculate totals
      threadStats.lines_added = threadStats.files.reduce((sum, f) => sum + f.lines_added, 0);
      threadStats.lines_removed = threadStats.files.reduce((sum, f) => sum + f.lines_removed, 0);

      setStats(threadStats);
      setDiff(diffText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load changes');
    } finally {
      setLoading(false);
    }
  };

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Get file icon based on change type
  const getFileIcon = (file: { lines_added: number; lines_removed: number }) => {
    if (file.lines_removed === 0 && file.lines_added > 0) {
      return <FilePlus className="h-3 w-3 text-green-500" />;
    }
    if (file.lines_added === 0 && file.lines_removed > 0) {
      return <Trash2 className="h-3 w-3 text-red-500" />;
    }
    return <FileEdit className="h-3 w-3 text-blue-500" />;
  };

  if (loading) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        Loading changes...
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("text-sm text-destructive", className)}>
        {error}
      </div>
    );
  }

  if (!stats || stats.files_changed === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        No changes
      </div>
    );
  }

  // Compact view - just summary
  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground",
          className
        )}
      >
        <ChevronRight className="h-4 w-4" />
        <span>{stats.files_changed} file{stats.files_changed !== 1 ? 's' : ''}</span>
        <span className="text-green-600">+{stats.lines_added}</span>
        <span className="text-red-600">-{stats.lines_removed}</span>
      </button>
    );
  }

  return (
    <div className={cn("text-sm", className)}>
      {/* Summary Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left hover:bg-muted/50 p-2 rounded"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span className="font-medium">
          {stats.files_changed} file{stats.files_changed !== 1 ? 's' : ''} changed
        </span>
        <span className="text-green-600 font-mono">+{stats.lines_added}</span>
        <span className="text-red-600 font-mono">-{stats.lines_removed}</span>
      </button>

      {/* Expanded View */}
      {expanded && (
        <div className="mt-2 space-y-2 pl-6">
          {/* File List */}
          <div className="space-y-1">
            {stats.files.map((file) => (
              <div key={file.path} className="group">
                <button
                  onClick={() => toggleFile(file.path)}
                  className="flex items-center gap-2 w-full text-left hover:bg-muted/50 px-2 py-1 rounded"
                >
                  {expandedFiles.has(file.path) ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {getFileIcon(file)}
                  <span className="font-mono text-xs truncate flex-1">
                    {file.path}
                  </span>
                  <span className="text-xs">
                    <span className="text-green-600">+{file.lines_added}</span>
                    {' '}
                    <span className="text-red-600">-{file.lines_removed}</span>
                  </span>
                </button>

                {/* File diff when expanded */}
                {expandedFiles.has(file.path) && (
                  <div className="mt-1 ml-5">
                    <DiffViewer
                      diff={extractFileDiff(diff, file.path)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Full Diff Button */}
          <button
            onClick={() => setExpandedFiles(
              expandedFiles.size === stats.files.length
                ? new Set()
                : new Set(stats.files.map(f => f.path))
            )}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expandedFiles.size === stats.files.length ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Extract the diff section for a specific file from the full diff
 */
function extractFileDiff(fullDiff: string, filePath: string): string {
  const lines = fullDiff.split('\n');
  const result: string[] = [];
  let inFile = false;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      // Check if this is the file we're looking for
      if (line.includes(filePath)) {
        inFile = true;
      } else if (inFile) {
        // We've moved to a different file
        break;
      }
    }

    if (inFile) {
      result.push(line);
    }
  }

  return result.join('\n');
}

export default ThreadChangesView;
