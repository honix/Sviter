import { getApiUrl } from '../utils/url';

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
 * Upload an image file to the wiki
 */
export async function uploadImage(
  file: File,
  folder: string = 'images',
  author: string = 'user'
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('folder', folder);
  formData.append('author', author);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || 'Upload failed');
  }

  return response.json();
}
