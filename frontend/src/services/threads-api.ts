/**
 * API client for thread operations
 */

const API_BASE_URL = 'http://localhost:8000';

export interface ThreadFile {
  path: string;
  content: string;
  has_conflicts: boolean;
  error?: boolean;
}

export interface ThreadFilesResponse {
  files: ThreadFile[];
  has_conflicts: boolean;
}

export class ThreadsAPI {
  /**
   * Get raw files from a thread's worktree
   * Used to display merge conflict markers during resolution
   */
  static async getThreadFiles(threadId: string, userId: string): Promise<ThreadFilesResponse> {
    const response = await fetch(
      `${API_BASE_URL}/api/threads/${threadId}/files?user_id=${encodeURIComponent(userId)}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch thread files: ${response.statusText}`);
    }

    return response.json();
  }
}
