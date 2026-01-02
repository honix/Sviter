import { useCallback } from 'react';

/**
 * Resolve a relative link against a current page path (GitHub-style).
 * E.g., resolveLink('data-views.md', 'agents/index.md') => 'agents/data-views.md'
 * E.g., resolveLink('examples/simple.tsx', 'agents/index.md') => 'agents/examples/simple.tsx'
 * E.g., resolveLink('../Home.md', 'agents/index.md') => 'Home.md'
 * E.g., resolveLink('../../foo.md', 'a/b/c.md') => 'foo.md'
 * E.g., resolveLink('/Home.md', 'agents/index.md') => 'Home.md' (absolute from root)
 */
export function resolveWikiLink(href: string, currentPagePath?: string): string {
  // If href starts with /, it's absolute from wiki root
  if (href.startsWith('/')) {
    return href.slice(1);
  }

  // If no current page, treat as-is
  if (!currentPagePath) {
    return href;
  }

  // Get directory of current page as array of segments
  const lastSlash = currentPagePath.lastIndexOf('/');
  const dirSegments = lastSlash === -1 ? [] : currentPagePath.slice(0, lastSlash).split('/');

  // Split href into segments
  const hrefSegments = href.split('/');

  // Process each segment
  const resultSegments = [...dirSegments];
  for (const segment of hrefSegments) {
    if (segment === '..') {
      // Go up one directory
      if (resultSegments.length > 0) {
        resultSegments.pop();
      }
    } else if (segment !== '.' && segment !== '') {
      // Add normal segment (skip . and empty)
      resultSegments.push(segment);
    }
  }

  return resultSegments.join('/');
}

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
