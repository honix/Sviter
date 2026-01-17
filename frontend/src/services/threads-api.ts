/**
 * API client for thread operations
 */
import { getApiUrl } from '../utils/url';
import { getAuthHeaders } from './auth-api';

const API_BASE_URL = getApiUrl();

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

export interface PinResponse {
  message: string;
  is_pinned: boolean;
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

  /**
   * Pin a thread for the current user
   */
  static async pinThread(threadId: string): Promise<PinResponse> {
    const response = await fetch(
      `${API_BASE_URL}/api/threads/${threadId}/pin`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to pin thread: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Unpin a thread for the current user
   */
  static async unpinThread(threadId: string): Promise<PinResponse> {
    const response = await fetch(
      `${API_BASE_URL}/api/threads/${threadId}/unpin`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to unpin thread: ${response.statusText}`);
    }

    return response.json();
  }
}
