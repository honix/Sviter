/**
 * PR Review Panel - displays PR review in center panel
 */
import React, { useState, useEffect } from 'react';
import { AgentsAPI } from '../../services/agents-api';
import { useAppContext } from '../../contexts/AppContext';
import { DiffViewer } from './DiffViewer';
import type { DiffStats } from '../../types/agent';

interface PRReviewPanelProps {
  branch: string;
}

export function PRReviewPanel({ branch }: PRReviewPanelProps) {
  const { actions } = useAppContext();
  const [diff, setDiff] = useState<string>('');
  const [stats, setStats] = useState<DiffStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadPRData();
  }, [branch]);

  const loadPRData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [diffData, statsData] = await Promise.all([
        AgentsAPI.getPRDiff(branch),
        AgentsAPI.getPRStats(branch),
      ]);

      setDiff(diffData.diff);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load PR data');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (processing) return;

    if (!confirm('Are you sure you want to approve and merge this PR?')) {
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      await AgentsAPI.approvePR(branch);

      // Close review and return to page view
      actions.closePRReview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve PR');
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (processing) return;

    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) {
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      await AgentsAPI.rejectPR(branch, reason || undefined);

      // Close review and return to page view
      actions.closePRReview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject PR');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading PR...</div>
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
                onClick={() => actions.closePRReview()}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ← Back
              </button>
              <span className="text-muted-foreground">|</span>
              <h2 className="text-lg font-semibold">Pull Request Review</h2>
            </div>
            <div className="font-mono text-xs text-muted-foreground">{branch}</div>
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
        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={processing}
            className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground rounded-md font-semibold transition-colors"
          >
            {processing ? 'Processing...' : '✓ Approve & Merge'}
          </button>
          <button
            onClick={handleReject}
            disabled={processing}
            className="flex-1 px-4 py-2 bg-destructive hover:bg-destructive/90 disabled:bg-muted disabled:cursor-not-allowed text-destructive-foreground rounded-md font-semibold transition-colors"
          >
            {processing ? 'Processing...' : '✗ Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}
