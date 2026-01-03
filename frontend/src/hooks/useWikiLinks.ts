import { useCallback } from 'react';
import { resolvePath } from '../utils/url';

// Re-export for backwards compatibility
export const resolveWikiLink = resolvePath;

/**
 * Hook for handling wiki link clicks and hover behavior in editors.
 * - On hover: transforms relative links to proper URLs for status bar display
 * - On click: navigates to the target page
 */
export function useWikiLinks(
  onLinkClick: ((pagePath: string) => void) | undefined,
  editable: boolean,
  currentPagePath?: string
) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    const link = (e.target as HTMLElement).closest('a');
    if (link && onLinkClick) {
      const pagePath = link.dataset.wikiPage;
      if (pagePath) {
        e.preventDefault();
        onLinkClick(pagePath);
      }
    }
  }, [onLinkClick]);

  const handleMouseOver = useCallback((e: React.MouseEvent) => {
    const link = (e.target as HTMLElement).closest('a');
    if (link && !link.dataset.wikiPage) {
      const href = link.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('mailto:')) {
        const resolvedPath = resolveWikiLink(href, currentPagePath);
        link.dataset.wikiPage = resolvedPath;
        link.setAttribute('href', `/main/${resolvedPath}/${editable ? 'edit' : 'view'}`);
      }
    }
  }, [editable, currentPagePath]);

  return { handleClick, handleMouseOver };
}
