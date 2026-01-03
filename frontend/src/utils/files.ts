/**
 * File utilities for image detection and handling.
 */

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

/**
 * Check if a path is an image based on file extension.
 */
export function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some(ext => lower.endsWith(`.${ext}`));
}

/**
 * Check if a file is an image based on MIME type.
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}
