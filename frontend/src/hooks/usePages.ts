import { useState, useCallback, useEffect } from 'react';
import { Page, PageTreeItem, ViewMode } from '../types/page';
import { useWebSocket } from './useWebSocket';

export interface UsePagesReturn {
  pages: Page[];
  currentPage: Page | null;
  pageTree: PageTreeItem[];
  viewMode: ViewMode;
  isLoading: boolean;
  error: string | null;
  setCurrentPage: (page: Page | null) => void;
  setViewMode: (mode: ViewMode) => void;
  createPage: (title: string, content?: string) => Promise<void>;
  updatePage: (id: number, updates: Partial<Page>) => Promise<void>;
  deletePage: (id: number) => Promise<void>;
  loadPages: () => Promise<void>;
}

export const usePages = (): UsePagesReturn => {
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('view');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { lastMessage } = useWebSocket('app-main');

  // Generate page tree structure
  const pageTree: PageTreeItem[] = pages.map(page => ({
    id: page.id,
    title: page.title
  }));

  // Load pages from backend on initialization
  useEffect(() => {
    loadPages();
  }, [loadPages]);

  // Handle WebSocket page update notifications
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'page_update') {
      loadPages(); // Refresh pages when AI modifies them
    }
  }, [lastMessage, loadPages]);

  const createPage = useCallback(async (title: string, content = '') => {
    setIsLoading(true);
    setError(null);

    try {
      const newPage: Page = {
        id: Date.now(), // In real app, this would come from backend
        title,
        content,
        author: 'user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: []
      };

      setPages(prev => [...prev, newPage]);
      setCurrentPage(newPage);
      setViewMode('edit');
    } catch (err) {
      setError('Failed to create page');
      console.error('Error creating page:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updatePage = useCallback(async (id: number, updates: Partial<Page>) => {
    setIsLoading(true);
    setError(null);

    try {
      const updatedPage = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      setPages(prev => prev.map(page =>
        page.id === id ? { ...page, ...updatedPage } : page
      ));

      if (currentPage?.id === id) {
        setCurrentPage(prev => prev ? { ...prev, ...updatedPage } : null);
      }
    } catch (err) {
      setError('Failed to update page');
      console.error('Error updating page:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage]);

  const deletePage = useCallback(async (id: number) => {
    setIsLoading(true);
    setError(null);

    try {
      setPages(prev => prev.filter(page => page.id !== id));

      if (currentPage?.id === id) {
        const remainingPages = pages.filter(page => page.id !== id);
        setCurrentPage(remainingPages.length > 0 ? remainingPages[0] : null);
      }
    } catch (err) {
      setError('Failed to delete page');
      console.error('Error deleting page:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pages]);

  const loadPages = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/api/pages');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const backendPages: Page[] = data.pages;

      setPages(backendPages);

      // Set current page to first page if none selected and pages exist
      if (!currentPage && backendPages.length > 0) {
        setCurrentPage(backendPages[0]);
      }
    } catch (err) {
      setError('Failed to load pages');
      console.error('Error loading pages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage]);

  return {
    pages,
    currentPage,
    pageTree,
    viewMode,
    isLoading,
    error,
    setCurrentPage,
    setViewMode,
    createPage,
    updatePage,
    deletePage,
    loadPages
  };
};