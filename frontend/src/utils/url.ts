/**
 * URL utilities for API and WebSocket connections.
 * Uses VITE_API_HOST environment variable, falls back to page location.
 */

/**
 * Get the API host from environment or derive from page location.
 */
function getHost(): string {
  // Use environment variable if set
  if (import.meta.env.VITE_API_HOST) {
    return import.meta.env.VITE_API_HOST;
  }
  // Fallback to current page host
  return window.location.host;
}

/**
 * Get the base API URL.
 * Uses VITE_API_HOST env var in dev, or current page host in prod.
 */
export function getApiUrl(): string {
  const host = getHost();
  // Use https if page is https, otherwise http
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${host}`;
}

/**
 * Get WebSocket URL for a given path.
 * Automatically uses ws:// or wss:// based on page protocol.
 */
export function getWsUrl(path: string): string {
  const host = getHost();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${host}${path}`;
}

/**
 * Resolve a relative path against a base path (GitHub-style).
 * Used for wiki links and image paths.
 *
 * @param path - The path to resolve (may be relative, root-relative, or have ../)
 * @param basePath - The current page/file path to resolve against
 * @returns Resolved path relative to wiki root
 *
 * @example
 * resolvePath('images/foo.png', 'docs/guide.md') => 'docs/images/foo.png'
 * resolvePath('../images/foo.png', 'docs/guide.md') => 'images/foo.png'
 * resolvePath('/images/foo.png', 'docs/guide.md') => 'images/foo.png'
 */
export function resolvePath(path: string, basePath?: string | null): string {
  // Decode URL-encoded paths first (markdown-it encodes spaces as %20)
  const decoded = decodeURIComponent(path);

  // If starts with /, it's root-relative
  if (decoded.startsWith('/')) {
    return decoded.slice(1);
  }

  // If no base path, treat as root-relative
  if (!basePath) {
    return decoded;
  }

  // Get directory of base path as array of segments
  const lastSlash = basePath.lastIndexOf('/');
  const dirSegments = lastSlash === -1 ? [] : basePath.slice(0, lastSlash).split('/');

  // Split path into segments
  const pathSegments = decoded.split('/');

  // Process each segment
  const resultSegments = [...dirSegments];
  for (const segment of pathSegments) {
    if (segment === '..') {
      if (resultSegments.length > 0) {
        resultSegments.pop();
      }
    } else if (segment !== '.' && segment !== '') {
      resultSegments.push(segment);
    }
  }

  return resultSegments.join('/');
}
