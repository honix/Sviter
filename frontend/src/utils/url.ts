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
