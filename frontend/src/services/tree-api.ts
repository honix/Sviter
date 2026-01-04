import type { TreeItem, MoveOperation, FolderCreate } from '../types/page';
import { getApiUrl } from '../utils/url';
import { getAuthHeaders } from './auth-api';

const API_BASE = getApiUrl();

export const treeApi = {
  async getTree(ref?: string): Promise<TreeItem[]> {
    const url = ref
      ? `${API_BASE}/api/pages/tree?ref=${encodeURIComponent(ref)}`
      : `${API_BASE}/api/pages/tree`;
    const response = await fetch(url, {
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Failed to fetch page tree');
    const data = await response.json();
    return data.tree;
  },

  async moveItem(operation: MoveOperation): Promise<void> {
    const response = await fetch(`${API_BASE}/api/pages/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        source_path: operation.sourcePath,
        target_parent_path: operation.targetParentPath,
        new_order: operation.newOrder
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to move item');
    }
  },

  async createFolder(data: FolderCreate): Promise<TreeItem> {
    const response = await fetch(`${API_BASE}/api/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        name: data.name,
        parent_path: data.parentPath
      })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to create folder');
    }
    return response.json();
  },

  async deleteFolder(path: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/folders/${encodeURIComponent(path)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete folder');
    }
  }
};
