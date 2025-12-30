import { useCallback } from 'react';

/**
 * Hook for handling wiki link clicks and hover behavior in editors.
 * - On hover: transforms relative links to proper URLs for status bar display
 * - On click: navigates to the target page
 */
export function useWikiLinks(
  onLinkClick: ((pagePath: string) => void) | undefined,
  editable: boolean
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
        // Check if href already has a file extension
        const hasExtension = /\.[a-zA-Z0-9]+$/.test(href);
        const pagePath = hasExtension ? href : `${href}.md`;
        link.dataset.wikiPage = pagePath;
        link.setAttribute('href', `/main/${pagePath}/${editable ? 'edit' : 'view'}`);
      }
    }
  }, [editable]);

  return { handleClick, handleMouseOver };
}
