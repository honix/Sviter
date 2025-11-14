/**
 * PRReview - full PR review page with diff and approve/reject actions
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AgentsAPI } from '../../services/agents-api';
import { DiffViewer } from './DiffViewer';
import type { PRDiff, DiffStats } from '../../types/agent';

export function PRReview() {
  const { branch } = useParams<{ branch: string }>();
  const navigate = useNavigate();

  const [diff, setDiff] = useState<string>('');
  const [stats, setStats] = useState<DiffStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (branch) {
      loadPRData();
    }
  }, [branch]);

  const loadPRData = async () => {
    if (!branch) return;

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
    if (!branch || processing) return;

    if (!confirm('Are you sure you want to approve and merge this PR?')) {
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      await AgentsAPI.approvePR(branch);

      // Navigate back to dashboard
      navigate('/agents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve PR');
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!branch || processing) return;

    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) {
      // User cancelled
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      await AgentsAPI.rejectPR(branch, reason || undefined);

      // Navigate back to dashboard
      navigate('/agents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject PR');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-gray-400">Loading PR...</div>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900">
        <div className="text-red-400">Invalid PR branch</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-900 text-gray-100">
      <div className="max-w-6xl mx-auto p-6 pb-24">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/agents')}
            className="text-blue-400 hover:text-blue-300 mb-4"
          >
            ← Back to Dashboard
          </button>

          <h1 className="text-2xl font-bold mb-2">Pull Request Review</h1>
          <div className="font-mono text-sm text-gray-400">{branch}</div>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Stats Summary */}
        {stats && (
          <div className="mb-6 p-4 bg-gray-800 rounded-lg">
            <h2 className="font-semibold mb-3">Changes Summary</h2>
            <div className="text-sm text-gray-300 mb-3">{stats.summary}</div>

            {stats.files_changed.length > 0 && (
              <div className="space-y-1">
                <div className="text-sm font-semibold text-gray-400 mb-2">
                  Files Changed:
                </div>
                {stats.files_changed.map((file, index) => (
                  <div key={index} className="text-sm font-mono flex justify-between">
                    <span className="text-gray-300">{file.path}</span>
                    <span className="text-gray-500">{file.changes}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Diff Viewer */}
        <div className="mb-6">
          <h2 className="font-semibold mb-3">Diff</h2>
          <DiffViewer diff={diff} />
        </div>

        {/* Action Buttons - Fixed at bottom */}
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 p-6 shadow-lg">
          <div className="max-w-6xl mx-auto flex gap-4">
            <button
              onClick={handleApprove}
              disabled={processing}
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
            >
              {processing ? 'Processing...' : '✓ Approve & Merge'}
            </button>
            <button
              onClick={handleReject}
              disabled={processing}
              className="flex-1 px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
            >
              {processing ? 'Processing...' : '✗ Reject'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
