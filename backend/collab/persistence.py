"""
Collaborative document persistence - saves Yjs documents to git.

Handles debounced saving of collaborative editing sessions to the wiki's
git-based storage system.
"""

import asyncio
import logging
from typing import Optional, Dict, Set
from pathlib import Path

logger = logging.getLogger(__name__)


class CollabPersistence:
    """
    Handles persistence of collaborative documents to git.

    Provides async methods for loading and saving page content,
    with support for debounced saves to avoid excessive commits.
    """

    def __init__(self, wiki):
        """
        Initialize persistence with wiki storage.

        Args:
            wiki: GitWiki instance for storage operations
        """
        self.wiki = wiki
        self._save_locks: Dict[str, asyncio.Lock] = {}

    def _get_lock(self, page_path: str) -> asyncio.Lock:
        """Get or create a lock for a page path."""
        if page_path not in self._save_locks:
            self._save_locks[page_path] = asyncio.Lock()
        return self._save_locks[page_path]

    async def load_page_content(self, page_path: str) -> Optional[str]:
        """
        Load page content from git storage.

        Args:
            page_path: The page path (room name)

        Returns:
            Page content as markdown string, or None if not found
        """
        try:
            # Run blocking git operation in thread pool
            loop = asyncio.get_event_loop()
            page = await loop.run_in_executor(
                None,
                lambda: self.wiki.get_page(page_path)
            )
            return page.get('content', '') if page else None

        except Exception as e:
            logger.warning(f"Failed to load page {page_path}: {e}")
            return None

    async def save_page_content(
        self,
        page_path: str,
        content: str,
        author: str = "Collaborative Edit"
    ):
        """
        Save page content to git storage.

        Args:
            page_path: The page path
            content: New markdown content
            author: Author name for git commit
        """
        lock = self._get_lock(page_path)

        async with lock:
            try:
                # Run blocking git operation in thread pool
                loop = asyncio.get_event_loop()

                # Get page title from path
                title = self._path_to_title(page_path)

                await loop.run_in_executor(
                    None,
                    lambda: self.wiki.update_page(
                        title=title,
                        content=content,
                        author=author,
                        commit_msg=f"Collaborative edit: {title}"
                    )
                )

                logger.info(f"Saved collaborative changes to {page_path}")

            except Exception as e:
                logger.error(f"Failed to save page {page_path}: {e}")
                raise

    def _path_to_title(self, page_path: str) -> str:
        """
        Convert a page path to a title.

        The page path might be:
        - "01-intro.md" -> "intro"
        - "folder/page.md" -> "folder/page"
        """
        # Remove .md extension
        if page_path.endswith('.md'):
            page_path = page_path[:-3]

        # Remove order prefix (e.g., "01-" or "001-")
        parts = page_path.split('/')
        cleaned_parts = []

        for part in parts:
            # Check if part starts with number prefix like "01-" or "001-"
            if '-' in part:
                prefix, rest = part.split('-', 1)
                if prefix.isdigit():
                    part = rest
            cleaned_parts.append(part)

        return '/'.join(cleaned_parts)

    async def page_exists(self, page_path: str) -> bool:
        """Check if a page exists in storage."""
        try:
            loop = asyncio.get_event_loop()
            title = self._path_to_title(page_path)
            page = await loop.run_in_executor(
                None,
                lambda: self.wiki.get_page(title)
            )
            return page is not None
        except Exception:
            return False
