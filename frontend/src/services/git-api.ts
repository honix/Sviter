/**
 * API client for git operations
 */
import type { DiffStats } from '../types/agent';
import { getApiUrl } from '../utils/url';

const API_BASE_URL = getApiUrl();

export class GitAPI {
  /**
   * Get unified diff between two branches
   */
  static async getBranchDiff(branch1: string, branch2: string): Promise<string> {
    const url = `${API_BASE_URL}/api/git/diff?branch1=${encodeURIComponent(branch1)}&branch2=${encodeURIComponent(branch2)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch branch diff: ${response.statusText}`);
    }
    const data = await response.json();
    return data.diff;
  }

  /**
   * Get diff statistics between two branches
   */
  static async getBranchDiffStats(branch1: string, branch2: string): Promise<DiffStats> {
    const url = `${API_BASE_URL}/api/git/diff-stats?branch1=${encodeURIComponent(branch1)}&branch2=${encodeURIComponent(branch2)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch branch diff stats: ${response.statusText}`);
    }
    const data = await response.json();
    return data.stats;
  }

  /**
   * Merge source branch into target branch
   */
  static async mergeBranch(sourceBranch: string, targetBranch: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/git/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_branch: sourceBranch,
        target_branch: targetBranch,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to merge branch: ${response.statusText}`);
    }
  }

  /**
   * List all branches
   */
  static async listBranches(): Promise<string[]> {
    const response = await fetch(`${API_BASE_URL}/api/git/branches`);
    if (!response.ok) {
      throw new Error(`Failed to fetch branches: ${response.statusText}`);
    }
    const data = await response.json();
    return data.branches;
  }

  /**
   * Get current branch (used for display only)
   */
  static async getCurrentBranch(): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/git/current-branch`);
    if (!response.ok) {
      throw new Error(`Failed to fetch current branch: ${response.statusText}`);
    }
    const data = await response.json();
    return data.branch;
  }

  /**
   * Delete a branch
   */
  static async deleteBranch(branch: string, force: boolean = false): Promise<void> {
    const url = `${API_BASE_URL}/api/git/branches/${encodeURIComponent(branch)}${force ? '?force=true' : ''}`;
    const response = await fetch(url, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete branch: ${response.statusText}`);
    }
  }

  /**
   * Checkout a branch
   */
  static async checkoutBranch(branch: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/git/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ branch }),
    });

    if (!response.ok) {
      throw new Error(`Failed to checkout branch: ${response.statusText}`);
    }
  }

  /**
   * Get per-file diff statistics with actual line counts
   */
  static async getDiffStatsByPage(baseBranch: string, headBranch: string): Promise<Record<string, { additions: number; deletions: number; file_type: string }>> {
    const url = `${API_BASE_URL}/api/git/diff-stats-by-page?base=${encodeURIComponent(baseBranch)}&head=${encodeURIComponent(headBranch)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch diff stats by page: ${response.statusText}`);
    }
    const data = await response.json();
    return data.stats;
  }
}
