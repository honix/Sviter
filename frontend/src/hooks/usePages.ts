import { useState, useCallback, useEffect } from 'react';
import { Page, PageTreeItem, ViewMode } from '../types/page';

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

  // Generate page tree structure
  const pageTree: PageTreeItem[] = pages.map(page => ({
    id: page.id,
    title: page.title
  }));

  // Initialize with sample data
  useEffect(() => {
    const samplePages: Page[] = [
      {
        id: 1,
        title: 'Welcome',
        content: '# Welcome to AI Wiki\n\nThis is a sample page. Click Edit to start editing.',
        author: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['welcome', 'introduction']
      },
      {
        id: 2,
        title: 'Getting Started',
        content: '# Getting Started\n\nHere are some tips to get you started with the AI Wiki.',
        author: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['guide', 'help']
      },
      {
        id: 3,
        title: 'Documentation',
        content: '# Documentation\n\nComplete documentation for the AI Wiki system.',
        author: 'system',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: ['docs', 'reference']
      }
    ];

    setPages(samplePages);
    setCurrentPage(samplePages[0]);
  }, []);

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
      // In a real app, this would fetch from the backend
      console.log('Loading pages from backend...');
    } catch (err) {
      setError('Failed to load pages');
      console.error('Error loading pages:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

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