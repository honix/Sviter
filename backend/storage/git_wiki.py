"""
Git-based wiki storage backend.
Replaces SQLite database with git repository for version control.
"""
import re
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Any
from git import Repo, GitCommandError, Actor
import frontmatter


class GitWikiException(Exception):
    """Base exception for GitWiki operations"""
    pass


class PageNotFoundException(GitWikiException):
    """Raised when a page is not found"""
    pass


class GitWiki:
    """
    Git-based wiki storage system.

    Manages wiki pages as markdown files in a git repository,
    with metadata stored in YAML frontmatter.
    """

    def __init__(self, repo_path: str):
        """
        Initialize GitWiki with path to git repository.

        Args:
            repo_path: Path to the wiki git repository
        """
        self.repo_path = Path(repo_path)
        self.pages_dir = self.repo_path / "pages"

        # Initialize or open git repository
        try:
            self.repo = Repo(self.repo_path)
        except Exception as e:
            raise GitWikiException(f"Failed to open git repository at {repo_path}: {e}")

        # Ensure pages directory exists
        self.pages_dir.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _create_author(author_name: str) -> Actor:
        """Create a git Actor object from author name"""
        return Actor(author_name, f"{author_name.replace(' ', '').lower()}@wiki.local")

    @staticmethod
    def title_to_filename(title: str) -> str:
        """
        Convert page title to safe filename slug.

        Args:
            title: Page title

        Returns:
            Filename slug with .md extension
        """
        # Convert to lowercase and replace spaces/special chars with hyphens
        slug = re.sub(r'[^\w\s-]', '', title.lower())
        slug = re.sub(r'[-\s]+', '-', slug)
        slug = slug.strip('-')

        # Handle edge cases
        if not slug:
            slug = "untitled"

        return f"{slug}.md"

    @staticmethod
    def filename_to_title(filename: str) -> str:
        """
        Convert filename back to a readable title.

        Args:
            filename: Filename (with or without .md extension)

        Returns:
            Readable title
        """
        # Remove .md extension
        name = filename.replace('.md', '')
        # Replace hyphens with spaces and title case
        return name.replace('-', ' ').title()

    def _get_page_path(self, title: str) -> Path:
        """Get full filesystem path for a page by title"""
        filename = self.title_to_filename(title)
        return self.pages_dir / filename

    def _parse_page(self, filepath: Path) -> Dict[str, Any]:
        """
        Parse a markdown file with frontmatter into a page dict.

        Args:
            filepath: Path to the markdown file

        Returns:
            Dictionary with page data
        """
        post = frontmatter.load(filepath)

        return {
            "title": post.metadata.get("title", self.filename_to_title(filepath.name)),
            "content": post.content,
            "author": post.metadata.get("author", "Unknown"),
            "created_at": post.metadata.get("created"),
            "updated_at": post.metadata.get("updated"),
            "tags": post.metadata.get("tags", []),
            "metadata": post.metadata,
            "path": str(filepath.relative_to(self.pages_dir))
        }

    def _create_page_content(self, title: str, content: str, author: str = "AI Agent",
                            tags: Optional[List[str]] = None) -> str:
        """
        Create markdown content with YAML frontmatter.

        Args:
            title: Page title
            content: Page content (markdown)
            author: Author name
            tags: List of tags

        Returns:
            Full markdown content with frontmatter
        """
        now = datetime.now().isoformat()

        post = frontmatter.Post(content)
        post.metadata = {
            "title": title,
            "created": now,
            "updated": now,
            "author": author,
            "tags": tags or []
        }

        return frontmatter.dumps(post)

    def get_page(self, title: str) -> Dict[str, Any]:
        """
        Get page by title.

        Args:
            title: Page title

        Returns:
            Page dictionary

        Raises:
            PageNotFoundException: If page doesn't exist
        """
        filepath = self._get_page_path(title)

        if not filepath.exists():
            raise PageNotFoundException(f"Page '{title}' not found")

        return self._parse_page(filepath)

    def create_page(self, title: str, content: str, author: str = "AI Agent",
                   tags: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Create a new page.

        Args:
            title: Page title
            content: Page content (markdown)
            author: Author name
            tags: List of tags

        Returns:
            Created page dictionary

        Raises:
            GitWikiException: If page already exists or git operation fails
        """
        filepath = self._get_page_path(title)

        if filepath.exists():
            raise GitWikiException(f"Page '{title}' already exists. Use update_page() instead.")

        # Create page content with frontmatter
        full_content = self._create_page_content(title, content, author, tags)

        # Write file
        filepath.write_text(full_content, encoding='utf-8')

        # Git add and commit
        try:
            relative_path = filepath.relative_to(self.repo_path)
            self.repo.index.add([str(relative_path)])
            self.repo.index.commit(f"Create page: {title}", author=self._create_author(author))
        except GitCommandError as e:
            # Rollback: delete the file
            filepath.unlink()
            raise GitWikiException(f"Git commit failed: {e}")

        return self._parse_page(filepath)

    def update_page(self, title: str, content: str, author: str = "AI Agent",
                   tags: Optional[List[str]] = None, commit_msg: Optional[str] = None) -> Dict[str, Any]:
        """
        Update an existing page.

        Args:
            title: Page title
            content: New page content (markdown)
            author: Author name
            tags: List of tags
            commit_msg: Custom commit message (optional)

        Returns:
            Updated page dictionary

        Raises:
            PageNotFoundException: If page doesn't exist
            GitWikiException: If git operation fails
        """
        filepath = self._get_page_path(title)

        if not filepath.exists():
            raise PageNotFoundException(f"Page '{title}' not found. Use create_page() to create it.")

        # Read existing frontmatter to preserve created date
        existing = frontmatter.load(filepath)
        created_at = existing.metadata.get("created", datetime.now().isoformat())

        # Create updated content
        post = frontmatter.Post(content)
        post.metadata = {
            "title": title,
            "created": created_at,
            "updated": datetime.now().isoformat(),
            "author": author,
            "tags": tags or existing.metadata.get("tags", [])
        }

        # Write file
        filepath.write_text(frontmatter.dumps(post), encoding='utf-8')

        # Git add and commit
        try:
            relative_path = filepath.relative_to(self.repo_path)
            self.repo.index.add([str(relative_path)])
            message = commit_msg or f"Update page: {title}"
            self.repo.index.commit(message, author=self._create_author(author))
        except GitCommandError as e:
            raise GitWikiException(f"Git commit failed: {e}")

        return self._parse_page(filepath)

    def delete_page(self, title: str, author: str = "AI Agent") -> bool:
        """
        Delete a page.

        Args:
            title: Page title
            author: Author name

        Returns:
            True if deleted successfully

        Raises:
            PageNotFoundException: If page doesn't exist
            GitWikiException: If git operation fails
        """
        filepath = self._get_page_path(title)

        if not filepath.exists():
            raise PageNotFoundException(f"Page '{title}' not found")

        # Git remove and commit
        try:
            relative_path = filepath.relative_to(self.repo_path)
            self.repo.index.remove([str(relative_path)])
            self.repo.index.commit(f"Delete page: {title}", author=self._create_author(author))

            # Delete the file
            filepath.unlink()
        except GitCommandError as e:
            raise GitWikiException(f"Git commit failed: {e}")

        return True

    def list_pages(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        List all pages in the wiki.

        Args:
            limit: Maximum number of pages to return (optional)

        Returns:
            List of page dictionaries (with minimal data for performance)
        """
        pages = []

        for filepath in self.pages_dir.rglob("*.md"):
            if filepath.is_file():
                try:
                    page_data = self._parse_page(filepath)
                    # Return minimal data for list view
                    pages.append({
                        "title": page_data["title"],
                        "author": page_data["author"],
                        "created_at": page_data["created_at"],
                        "updated_at": page_data["updated_at"],
                        "tags": page_data["tags"],
                        "path": page_data["path"]
                    })
                except Exception as e:
                    # Skip corrupted files
                    print(f"Warning: Failed to parse {filepath}: {e}")
                    continue

        # Sort by updated_at (most recent first)
        pages.sort(key=lambda p: p["updated_at"] or "", reverse=True)

        if limit:
            pages = pages[:limit]

        return pages

    def search_pages(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Search pages by content using git grep.

        Args:
            query: Search query
            limit: Maximum number of results

        Returns:
            List of matching page dictionaries
        """
        try:
            # Use git grep for fast searching
            result = self.repo.git.grep(
                '-l',  # Only show filenames
                '-i',  # Case insensitive
                query,
                'pages/'
            )

            # Parse results
            matched_files = result.strip().split('\n') if result else []
            pages = []

            for file_path in matched_files[:limit]:
                filepath = self.repo_path / file_path
                if filepath.exists():
                    pages.append(self._parse_page(filepath))

            return pages

        except GitCommandError:
            # No matches found, or error - fall back to manual search
            return self._manual_search(query, limit)

    def _manual_search(self, query: str, limit: int) -> List[Dict[str, Any]]:
        """
        Fallback manual search when git grep fails.

        Args:
            query: Search query
            limit: Maximum number of results

        Returns:
            List of matching page dictionaries
        """
        pages = []
        query_lower = query.lower()

        for filepath in self.pages_dir.rglob("*.md"):
            if filepath.is_file():
                try:
                    content = filepath.read_text(encoding='utf-8').lower()
                    if query_lower in content:
                        pages.append(self._parse_page(filepath))

                        if len(pages) >= limit:
                            break
                except Exception:
                    continue

        return pages

    def get_page_history(self, title: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Get commit history for a page.

        Args:
            title: Page title
            limit: Maximum number of commits to return

        Returns:
            List of commit dictionaries

        Raises:
            PageNotFoundException: If page doesn't exist
        """
        filepath = self._get_page_path(title)

        if not filepath.exists():
            raise PageNotFoundException(f"Page '{title}' not found")

        try:
            relative_path = filepath.relative_to(self.repo_path)
            commits = list(self.repo.iter_commits(paths=str(relative_path), max_count=limit))

            history = []
            for commit in commits:
                history.append({
                    "sha": commit.hexsha,
                    "short_sha": commit.hexsha[:7],
                    "message": commit.message.strip(),
                    "author": commit.author.name,
                    "date": commit.committed_datetime.isoformat(),
                    "timestamp": commit.committed_date
                })

            return history

        except GitCommandError as e:
            raise GitWikiException(f"Failed to get history: {e}")

    def get_page_at_revision(self, title: str, commit_sha: str) -> Dict[str, Any]:
        """
        Get page content at a specific commit.

        Args:
            title: Page title
            commit_sha: Git commit SHA

        Returns:
            Page dictionary at that revision

        Raises:
            GitWikiException: If commit not found or operation fails
        """
        filepath = self._get_page_path(title)
        relative_path = filepath.relative_to(self.repo_path)

        try:
            # Get file content at specific commit
            content = self.repo.git.show(f"{commit_sha}:{relative_path}")

            # Parse frontmatter
            post = frontmatter.loads(content)

            return {
                "title": post.metadata.get("title", title),
                "content": post.content,
                "author": post.metadata.get("author", "Unknown"),
                "created_at": post.metadata.get("created"),
                "updated_at": post.metadata.get("updated"),
                "tags": post.metadata.get("tags", []),
                "metadata": post.metadata,
                "revision": commit_sha[:7]
            }

        except GitCommandError as e:
            raise GitWikiException(f"Failed to get revision {commit_sha}: {e}")
