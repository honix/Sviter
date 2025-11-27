/**
 * API client for git operations
 */
import type { DiffStats, BranchDiff } from '../types/agent';

const API_BASE_URL = 'http://localhost:8000';

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
   * Get current branch
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
   * Checkout a branch
   */
  static async checkoutBranch(branchName: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/git/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ branch: branchName }),
    });

    if (!response.ok) {
      throw new Error(`Failed to checkout branch: ${response.statusText}`);
    }
  }

  /**
   * Create a new branch
   */
  static async createBranch(branchName: string, fromBranch: string = 'main'): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/git/create-branch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: branchName,
        from: fromBranch,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create branch: ${response.statusText}`);
    }
    const data = await response.json();
    return data.branch;
  }

  /**
   * Delete a branch
   */
  static async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
    const response = await fetch(
      `${API_BASE_URL}/api/git/branches/${encodeURIComponent(branchName)}?force=${force}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete branch: ${response.statusText}`);
    }
  }
}
