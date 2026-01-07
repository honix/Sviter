/**
 * Hook for listing files in a folder with pattern matching.
 * Used by views to render collections of typed data files.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl } from '../utils/url';

export interface UseFolderResult {
  /** List of file paths matching the pattern */
  files: string[];
  /** Whether the initial load has completed */
  isLoaded: boolean;
  /** Whether data is currently being fetched */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually refresh the file list */
  refresh: () => void;
}

/**
 * Match a filename against a glob-like pattern.
 * Supports:
 * - * matches any characters
 * - Exact string match
 */
function matchPattern(filename: string, pattern: string): boolean {
  if (!pattern || pattern === '*') return true;

  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
    .replace(/\*/g, '.*'); // Convert * to .*

  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(filename);
}

/**
 * Hook for listing files in a wiki folder.
 *
 * @param folderPath - Path to the folder (e.g., "projects/my-project/tasks/")
 * @param pattern - Optional glob pattern to filter files (e.g., "*.task.json")
 * @returns List of matching file paths and loading state
 *
 * @example
 * ```tsx
 * const { files, isLoaded } = useFolder('tasks/', '*.task.json');
 * // files = ['tasks/1.task.json', 'tasks/2.task.json', ...]
 * ```
 */
export function useFolder(
  folderPath: string,
  pattern?: string
): UseFolderResult {
  const [files, setFiles] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshCounterRef = useRef(0);

  const fetchFiles = useCallback(async () => {
    if (!folderPath) {
      setFiles([]);
      setIsLoaded(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch the page tree from API
      const response = await fetch(`${getApiUrl()}/api/pages/tree`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Handle both { tree: [...] } and [...] response formats
      const tree = Array.isArray(data) ? data : (data.tree || []);

      // Normalize folder path (ensure it ends with /)
      const normalizedFolder = folderPath.endsWith('/')
        ? folderPath
        : `${folderPath}/`;

      // Find all files in the specified folder
      const matchingFiles: string[] = [];

      const searchTree = (items: any[], parentPath: string = '') => {
        for (const item of items) {
          const itemPath = item.path || '';

          if (item.type === 'folder' && item.children) {
            // Recurse into subfolders
            searchTree(item.children, itemPath);
          } else if (item.type === 'page') {
            // Check if file is in the target folder
            if (itemPath.startsWith(normalizedFolder)) {
              const filename = itemPath.slice(normalizedFolder.length);
              // Only include direct children (no subfolders)
              if (!filename.includes('/')) {
                // Apply pattern filter if specified
                if (!pattern || matchPattern(filename, pattern)) {
                  matchingFiles.push(itemPath);
                }
              }
            }
          }
        }
      };

      searchTree(tree);

      // Sort alphabetically
      matchingFiles.sort((a, b) => a.localeCompare(b));

      setFiles(matchingFiles);
      setIsLoaded(true);
    } catch (err) {
      console.error('Failed to fetch folder contents:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch folder');
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [folderPath, pattern]);

  // Initial fetch
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const refresh = useCallback(() => {
    refreshCounterRef.current += 1;
    fetchFiles();
  }, [fetchFiles]);

  return {
    files,
    isLoaded,
    isLoading,
    error,
    refresh,
  };
}

export default useFolder;
