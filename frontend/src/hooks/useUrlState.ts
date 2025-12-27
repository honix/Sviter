/**
 * URL-based state management hook.
 * Syncs app state with browser URL for deep linking and navigation.
 *
 * URL format: /{context}/{page-path}/{mode}
 * - context: "main" for main branch, or branch name (without thread/ prefix) for threads
 * - page-path: file path including folders (e.g., "agents/index.md")
 * - mode: "view", "edit" for main; "preview", "diff", "history" for threads
 *
 * Examples:
 * - /main/home.md/view
 * - /main/agents/index.md/edit
 * - /add-hello-world-tsx-e5e491/hello.tsx/preview
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext';

export type MainMode = 'view' | 'edit';
export type BranchMode = 'preview' | 'diff' | 'history';
export type UrlMode = MainMode | BranchMode;

export interface UrlState {
  context: string; // 'main' or branch name (without thread/ prefix)
  pagePath: string | null;
  mode: UrlMode;
}

const MAIN_MODES: MainMode[] = ['view', 'edit'];
const BRANCH_MODES: BranchMode[] = ['preview', 'diff', 'history'];
const ALL_MODES: UrlMode[] = [...MAIN_MODES, ...BRANCH_MODES];

/**
 * Parse URL pathname into state components.
 */
export function parseUrl(pathname: string): UrlState {
  // Handle root URL
  if (pathname === '/' || pathname === '') {
    return { context: 'main', pagePath: null, mode: 'view' };
  }

  // Remove leading slash and split
  const parts = pathname.slice(1).split('/').map(decodeURIComponent);

  if (parts.length < 1) {
    return { context: 'main', pagePath: null, mode: 'view' };
  }

  const context = parts[0];

  // Check if last part is a valid mode
  const lastPart = parts[parts.length - 1];
  const isValidMode = ALL_MODES.includes(lastPart as UrlMode);

  let mode: UrlMode = context === 'main' ? 'view' : 'preview';
  let pathParts = parts.slice(1);

  if (isValidMode && parts.length > 2) {
    mode = lastPart as UrlMode;
    pathParts = parts.slice(1, -1);
  }

  const pagePath = pathParts.length > 0 ? pathParts.join('/') : null;

  return { context, pagePath, mode };
}

/**
 * Build URL pathname from state.
 */
export function buildUrl(state: UrlState): string {
  const { context, pagePath, mode } = state;

  if (!pagePath) {
    return '/';
  }

  // Encode each path segment but preserve slashes
  const encodedPath = pagePath
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/');

  return `/${encodeURIComponent(context)}/${encodedPath}/${mode}`;
}

/**
 * Hook that manages bidirectional sync between URL and app state.
 */
export function useUrlState() {
  const { state, actions } = useAppContext();
  const {
    currentPage,
    viewMode,
    selectedBranchForDiff,
    threads,
    branchViewMode,
    pages
  } = state;

  // Track if URL change was triggered by us (to avoid loops)
  const isInternalUpdate = useRef(false);
  // Track previous URL to avoid redundant pushes
  const previousUrl = useRef<string>(window.location.pathname);
  // Track if initial load has been processed
  const initialLoadDone = useRef(false);

  /**
   * Derive current URL state from app state.
   */
  const getCurrentUrlState = useCallback((): UrlState => {
    // Determine context
    let context: string = 'main';
    if (selectedBranchForDiff) {
      // Find thread by branch and use branch name (without thread/ prefix) for uniqueness
      const thread = threads.find(t => t.branch === selectedBranchForDiff);
      if (thread?.branch) {
        // Branch format: "thread/name-hash" -> use "name-hash" part
        context = thread.branch.replace(/^thread\//, '');
      }
    }

    // Determine mode
    let mode: UrlMode;
    if (context === 'main') {
      mode = viewMode === 'edit' ? 'edit' : 'view';
    } else {
      mode = branchViewMode || 'preview';
    }

    return {
      context,
      pagePath: currentPage?.path || null,
      mode
    };
  }, [currentPage?.path, viewMode, selectedBranchForDiff, threads, branchViewMode]);

  /**
   * Apply URL state to app state.
   */
  const applyUrlState = useCallback(async (urlState: UrlState) => {
    isInternalUpdate.current = true;

    try {
      const { context, pagePath, mode } = urlState;

      // Handle context (main vs thread)
      if (context === 'main') {
        if (selectedBranchForDiff) {
          actions.closeBranchDiff();
        }
        // Set view mode for main
        if (mode === 'edit') {
          actions.setViewMode('edit');
        } else {
          actions.setViewMode('view');
        }
      } else {
        // Find thread by branch name (context is branch without thread/ prefix)
        const branchName = `thread/${context}`;
        const thread = threads.find(t => t.branch === branchName);
        if (thread) {
          // Select thread for chat panel
          actions.selectThread(thread.id);
          // Set up branch diff view
          if (thread.branch) {
            actions.viewBranchDiff(thread.branch);
          }
        }
        // Set branch view mode
        if (BRANCH_MODES.includes(mode as BranchMode)) {
          actions.setBranchViewMode(mode as BranchMode);
        }
      }

      // Handle page selection
      const targetPath = pagePath || 'home.md';
      const page = pages.find(p => p.path === targetPath);

      if (page) {
        await actions.setCurrentPage(page);
      } else if (targetPath) {
        // Page might not be loaded yet - try to load it
        // Create minimal page object and let setCurrentPage fetch it
        const ext = targetPath.split('.').pop()?.toLowerCase();
        const fileType = ext === 'csv' ? 'csv' : ext === 'tsx' ? 'tsx' : 'markdown';
        const minimalPage = {
          path: targetPath,
          title: targetPath.split('/').pop() || targetPath,
          content: '',
          file_type: fileType as 'markdown' | 'csv' | 'tsx',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await actions.setCurrentPage(minimalPage);
      }

    } finally {
      // Small delay to ensure state updates complete
      setTimeout(() => {
        isInternalUpdate.current = false;
      }, 100);
    }
  }, [pages, selectedBranchForDiff, threads, actions]);

  /**
   * Push URL to history when state changes.
   */
  useEffect(() => {
    // Skip if this is an internal update or initial load not done
    if (isInternalUpdate.current || !initialLoadDone.current) return;

    const urlState = getCurrentUrlState();
    const newUrl = buildUrl(urlState);

    if (newUrl !== previousUrl.current) {
      window.history.pushState({ urlState }, '', newUrl);
      previousUrl.current = newUrl;
    }
  }, [currentPage?.path, viewMode, selectedBranchForDiff, branchViewMode, getCurrentUrlState]);

  /**
   * Handle popstate (browser back/forward).
   */
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const urlState = event.state?.urlState || parseUrl(window.location.pathname);
      previousUrl.current = window.location.pathname;
      applyUrlState(urlState);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyUrlState]);

  // Store pending URL state for thread contexts that need to wait for threads to load
  const pendingUrlState = useRef<UrlState | null>(null);

  /**
   * Initial URL parsing on mount.
   */
  useEffect(() => {
    // Wait for pages to load before applying URL state
    if (pages.length === 0) return;

    const urlState = parseUrl(window.location.pathname);

    // For thread context URLs, wait for threads to load
    if (urlState.context !== 'main') {
      const branchName = `thread/${urlState.context}`;
      const thread = threads.find(t => t.branch === branchName);

      if (!thread) {
        // Thread not loaded yet - store pending state and wait
        pendingUrlState.current = urlState;
        return;
      }
    }

    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    pendingUrlState.current = null;

    // Apply URL state if there's a specific page or non-main context
    if (urlState.pagePath || urlState.context !== 'main') {
      applyUrlState(urlState);
    } else {
      // Root URL - load default home page
      const homePage = pages.find(p => p.path === 'home.md');
      if (homePage) {
        actions.setCurrentPage(homePage);
      }
    }

    // Replace initial history state
    const currentUrlState = urlState.pagePath ? urlState : {
      context: 'main',
      pagePath: 'home.md',
      mode: 'view' as UrlMode
    };
    window.history.replaceState({ urlState: currentUrlState }, '', buildUrl(currentUrlState));
    previousUrl.current = buildUrl(currentUrlState);
  }, [pages, threads, applyUrlState, actions]);

  /**
   * Apply pending URL state when threads become available.
   */
  useEffect(() => {
    if (!pendingUrlState.current || initialLoadDone.current) return;
    if (threads.length === 0) return;

    const urlState = pendingUrlState.current;
    const branchName = `thread/${urlState.context}`;
    const thread = threads.find(t => t.branch === branchName);

    if (thread) {
      initialLoadDone.current = true;
      pendingUrlState.current = null;
      applyUrlState(urlState);

      // Update history state with the thread URL
      window.history.replaceState({ urlState }, '', buildUrl(urlState));
      previousUrl.current = buildUrl(urlState);
    }
  }, [threads, applyUrlState]);

  return {
    parseUrl,
    buildUrl,
    getCurrentUrlState
  };
}
