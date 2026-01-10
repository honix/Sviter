import { getApiUrl } from '../utils/url';
import { getAuthHeaders } from './auth-api';

// Re-export from shared utility for backwards compatibility
export { isImageFile } from '../utils/files';

const API_BASE_URL = `${getApiUrl()}/api`;

export interface UploadResponse {
  path: string;
  url: string;
  filename: string;
  markdown: string;
}

/**
 * Upload a file to the wiki
 */
export async function uploadFile(
  file: File,
  folder: string = 'uploads'
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || 'Upload failed');
  }

  return response.json();
}

// Backwards compatibility alias
export const uploadImage = uploadFile;
