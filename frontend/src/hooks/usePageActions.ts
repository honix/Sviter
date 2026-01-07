/**
 * Hook for page CRUD operations in views.
 * Provides createPage and deletePage functions for typed data views.
 */

import { useCallback } from 'react';
import { createPage as apiCreatePage, deletePage as apiDeletePage } from '../services/api';

export interface UsePageActionsResult {
  /**
   * Create a new page with the given content.
   * @param path - Full path for the new page (e.g., "tasks/123.task.json")
   * @param content - Content to write to the page
   */
  createPage: (path: string, content: string) => Promise<void>;

  /**
   * Delete a page by path.
   * @param path - Path of the page to delete (e.g., "tasks/123.task.json")
   */
  deletePage: (path: string) => Promise<void>;
}

/**
 * Hook providing page create/delete actions for views.
 *
 * @example
 * ```tsx
 * const { createPage, deletePage } = usePageActions();
 *
 * const addTask = async () => {
 *   await createPage('tasks/new.task.json', JSON.stringify({ title: 'New Task' }));
 * };
 *
 * const removeTask = async (path: string) => {
 *   await deletePage(path);
 * };
 * ```
 */
export function usePageActions(): UsePageActionsResult {
  const createPage = useCallback(async (path: string, content: string) => {
    try {
      await apiCreatePage(path, content);
    } catch (error) {
      console.error('Failed to create page:', error);
      throw error;
    }
  }, []);

  const deletePage = useCallback(async (path: string) => {
    try {
      await apiDeletePage(path);
    } catch (error) {
      console.error('Failed to delete page:', error);
      throw error;
    }
  }, []);

  return {
    createPage,
    deletePage,
  };
}

export default usePageActions;
