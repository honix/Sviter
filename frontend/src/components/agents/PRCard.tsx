/**
 * PR Card component - displays a pull request summary
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { PullRequest } from '../../types/agent';

interface PRCardProps {
  pr: PullRequest;
}

export function PRCard({ pr }: PRCardProps) {
  const navigate = useNavigate();

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
  };

  const extractTitle = (commitMsg: string): string => {
    // Extract first line of commit message
    return commitMsg.split('\n')[0] || 'No title';
  };

  const handleClick = () => {
    navigate(`/agents/pr/${encodeURIComponent(pr.branch)}`);
  };

  return (
    <div
      className="border border-gray-700 rounded-lg p-4 hover:bg-gray-800 cursor-pointer transition-colors"
      onClick={handleClick}
    >
      {/* Branch name */}
      <div className="text-sm text-gray-400 mb-2 font-mono">
        {pr.branch}
      </div>

      {/* Commit title */}
      <h3 className="text-lg font-semibold mb-2">
        {extractTitle(pr.commit_message)}
      </h3>

      {/* Metadata */}
      <div className="flex items-center gap-4 text-sm text-gray-400">
        <span>{formatTimeAgo(pr.timestamp)}</span>
        <span>•</span>
        <span>{pr.files_changed} file{pr.files_changed !== 1 ? 's' : ''}</span>
        <span>•</span>
        <span>{pr.diff_summary}</span>
      </div>

      {/* Tags (if present) */}
      {pr.tags && pr.tags.length > 0 && (
        <div className="flex gap-2 mt-3">
          {pr.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-1 text-xs rounded bg-blue-900 text-blue-200"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
