/**
 * Branch Diff Panel - displays branch diff and merge options in center panel
 */
import React, { useState, useEffect } from 'react';
import { GitAPI } from '../../services/git-api';
import { useAppContext } from '../../contexts/AppContext';
import { DiffViewer } from './DiffViewer';
import type { DiffStats } from '../../types/agent';

interface BranchDiffPanelProps {
  branch: string;
  currentBranch: string;
}

export function BranchDiffPanel({ branch, currentBranch }: BranchDiffPanelProps) {
  const { actions } = useAppContext();
  const [diff, setDiff] = useState<string>('');
  const [stats, setStats] = useState<DiffStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadDiffData();
  }, [branch, currentBranch]);

  const loadDiffData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [diffText, statsData] = await Promise.all([
        GitAPI.getBranchDiff(currentBranch, branch),
        GitAPI.getBranchDiffStats(currentBranch, branch),
      ]);

      setDiff(diffText);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diff');
    } finally {
      setLoading(false);
    }
  };

  const handleMerge = async () => {
    if (processing) return;

    if (!confirm(`Are you sure you want to merge "${branch}" into "${currentBranch}"?`)) {
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      await GitAPI.mergeBranch(branch, currentBranch);

      // Delete the branch after successful merge
      await GitAPI.deleteBranch(branch);

      // Refresh branches list
      await actions.refreshBranches();

      // Close diff view and return to page view
      actions.closeBranchDiff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge branch');
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (processing) return;

    if (!confirm(`Are you sure you want to delete branch "${branch}" without merging?`)) {
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      await GitAPI.deleteBranch(branch, true);

      // Refresh branches list
      await actions.refreshBranches();

      // Close diff view and return to page view
      actions.closeBranchDiff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete branch');
      setProcessing(false);
    }
  };

  const handleCheckout = async () => {
    if (processing) return;

    try {
      setProcessing(true);
      setError(null);

      await actions.checkoutBranch(branch);

      // Close diff view and return to page view
      actions.closeBranchDiff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to checkout branch');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading diff...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => actions.closeBranchDiff()}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ← Back
              </button>
              <span className="text-muted-foreground">|</span>
              <h2 className="text-lg font-semibold">Branch Diff</h2>
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-mono">{currentBranch}</span>
              <span className="text-muted-foreground mx-2">←</span>
              <span className="font-mono">{branch}</span>
            </div>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="mt-3 p-2 bg-destructive/10 border border-destructive/20 rounded text-destructive text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Stats Summary */}
        {stats && (
          <div className="p-3 bg-muted rounded-md border border-border">
            <h3 className="font-semibold text-sm mb-2">Changes Summary</h3>
            <div className="text-sm text-muted-foreground mb-3">{stats.summary}</div>

            {stats.files_changed.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground mb-2">
                  Files Changed:
                </div>
                {stats.files_changed.map((file, index) => (
                  <div key={index} className="text-xs font-mono flex justify-between">
                    <span>{file.path}</span>
                    <span className="text-muted-foreground">{file.changes}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Diff Viewer */}
        <div>
          <h3 className="font-semibold text-sm mb-2">Diff</h3>
          <DiffViewer diff={diff} />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="border-t border-border p-4 bg-background">
        <div className="flex gap-2">
          <button
            onClick={handleMerge}
            disabled={processing}
            className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground rounded-md font-semibold transition-colors text-sm"
          >
            {processing ? 'Processing...' : `Merge into ${currentBranch}`}
          </button>
          <button
            onClick={handleCheckout}
            disabled={processing}
            className="px-4 py-2 bg-secondary hover:bg-secondary/90 disabled:bg-muted disabled:cursor-not-allowed text-secondary-foreground rounded-md font-semibold transition-colors text-sm"
          >
            {processing ? 'Processing...' : 'Checkout'}
          </button>
          <button
            onClick={handleDelete}
            disabled={processing}
            className="px-4 py-2 bg-destructive hover:bg-destructive/90 disabled:bg-muted disabled:cursor-not-allowed text-destructive-foreground rounded-md font-semibold transition-colors text-sm"
          >
            {processing ? 'Processing...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
