"""
Git-based wiki storage backend.
Replaces SQLite database with git repository for version control.

Supports multiple file types:
- Markdown (.md) - wiki pages
- CSV (.csv) - data files for interactive views
- TSX (.tsx) - React view components

Metadata (author, dates) comes from git history.
Navigation and tags are in agents/index.md.
"""
import re
import csv
import io
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Any
from git import Repo, GitCommandError, Actor


# Templates directory (for auto-instantiating agent examples)
TEMPLATES_DIR = Path(__file__).parent.parent / "templates"


# Supported file extensions for wiki content
SUPPORTED_EXTENSIONS = {'.md', '.csv', '.tsx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}



class GitWikiException(Exception):
    """Base exception for GitWiki operations"""
    pass


class PageNotFoundException(GitWikiException):
    """Raised when a page is not found"""
    pass


class GitWiki:
    """
    Git-based wiki storage system.

    Manages wiki pages as plain markdown files in a git repository.
    No frontmatter - metadata comes from git history.
    Pages are sorted alphabetically.
    """

    def __init__(self, repo_path: str):
        """
        Initialize GitWiki with path to git repository.

        Args:
            repo_path: Path to the wiki git repository
        """
        self.repo_path = Path(repo_path)

        # Initialize or open git repository
        try:
            self.repo = Repo(self.repo_path)
        except Exception as e:
            raise GitWikiException(f"Failed to open git repository at {repo_path}: {e}")

        # Initialize agents/ folder with default files if missing
        self._ensure_agents_folder()

    def _ensure_agents_folder(self):
        """
        Ensure agents/ folder exists.

        The actual content (index.md, examples, etc.) is handled by
        ensure_templates() which copies from backend/templates/.
        """
        agents_dir = self.repo_path / "agents"
        agents_dir.mkdir(exist_ok=True)

    def ensure_templates(self) -> List[str]:
        """
        Copy template files to wiki if they don't exist.

        Templates are stored in backend/templates/ and get auto-instantiated
        into the wiki on startup. This provides example files for agents
        to learn from.

        Returns:
            List of created page paths
        """
        if not TEMPLATES_DIR.exists():
            return []

        created = []

        for template_path in TEMPLATES_DIR.rglob("*"):
            if not template_path.is_file():
                continue

            # Skip hidden files
            if template_path.name.startswith('.'):
                continue

            # Get relative path from templates dir
            rel_path = template_path.relative_to(TEMPLATES_DIR)
            wiki_path = self.repo_path / rel_path

            # Only copy if doesn't exist
            if not wiki_path.exists():
                # Create parent directories
                wiki_path.parent.mkdir(parents=True, exist_ok=True)
                # Copy file
                shutil.copy(template_path, wiki_path)
                created.append(str(rel_path))

        # Commit all created files
        if created:
            try:
                for rel_path in created:
                    self.repo.index.add([str(rel_path)])
                self.repo.index.commit(
                    f"Initialize templates: {', '.join(created[:3])}{'...' if len(created) > 3 else ''}",
                    author=self._create_author("System")
                )
                print(f"Initialized {len(created)} template files: {', '.join(created)}")
            except Exception as e:
                print(f"Warning: Failed to commit templates: {e}")

        return created

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
        # Remove numeric order prefix if present (e.g., "01-intro" -> "intro")
        order, slug = GitWiki._parse_order_from_filename(name + '.md')
        if order > 0:
            name = slug
        # Replace hyphens with spaces and title case
        return name.replace('-', ' ').title()

    @staticmethod
    def _parse_order_from_filename(filename: str) -> tuple:
        """
        Extract order number and slug from filename.

        Args:
            filename: Filename like '01-introduction.md' or '02-folder'

        Returns:
            Tuple of (order: int, slug: str)
        """
        # Remove .md extension for processing
        name = filename.replace('.md', '')

        # Match pattern: NN-slug or NNN-slug
        match = re.match(r'^(\d{2,3})-(.+)$', name)
        if match:
            return int(match.group(1)), match.group(2)

        # No order prefix - return 0 and full name
        return 0, name

    @staticmethod
    def _get_file_type(filepath: Path) -> str:
        """
        Determine file type from extension.

        Args:
            filepath: Path to file

        Returns:
            'markdown', 'csv', 'tsx', 'image', or 'unknown'
        """
        ext = filepath.suffix.lower()
        if ext == '.md':
            return 'markdown'
        elif ext == '.csv':
            return 'csv'
        elif ext == '.tsx':
            return 'tsx'
        elif ext in {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}:
            return 'image'
        else:
            return 'unknown'

    def _get_page_path(self, title: str) -> Path:
        """Get full filesystem path for a page by title or path.

        Expects full path for files in subdirectories (e.g., "agents/index.md").
        Supports .md, .csv, and .tsx files.
        """
        # Direct path lookup - this is the expected case
        has_extension = any(title.endswith(ext) for ext in SUPPORTED_EXTENSIONS)
        if has_extension or '/' in title:
            direct_path = self.repo_path / title
            if direct_path.exists():
                return direct_path

        # Try exact filename match (for .md files)
        filename = self.title_to_filename(title)
        exact_path = self.repo_path / filename
        if exact_path.exists():
            return exact_path

        # Fallback to the exact path (will fail exists check later)
        return self.repo_path / title

    def _parse_page(self, filepath: Path) -> Dict[str, Any]:
        """
        Parse a file into a page dict.

        Handles different file types:
        - Markdown (.md): Strips frontmatter if present
        - CSV (.csv): Parses into headers and rows
        - TSX (.tsx): Returns raw content

        Args:
            filepath: Path to the file

        Returns:
            Dictionary with page data (path, content, file_type, and type-specific fields)
        """
        raw_content = filepath.read_text(encoding='utf-8')
        file_type = self._get_file_type(filepath)

        base_result = {
            "path": str(filepath.relative_to(self.repo_path)),
            "title": filepath.name,
            "file_type": file_type,
            "has_conflicts": "<<<<<<" in raw_content or "=======" in raw_content
        }

        if file_type == 'csv':
            # Parse CSV into headers and rows
            base_result["content"] = raw_content
            try:
                reader = csv.DictReader(io.StringIO(raw_content))
                rows = list(reader)
                base_result["headers"] = reader.fieldnames or []
                base_result["rows"] = rows
            except Exception:
                # Fallback if CSV parsing fails
                base_result["headers"] = []
                base_result["rows"] = []
        elif file_type == 'tsx':
            # TSX: Return raw content as-is
            base_result["content"] = raw_content
        else:
            # Markdown: Strip frontmatter if present
            base_result["content"] = self._strip_frontmatter(raw_content)

        return base_result

    def _strip_frontmatter(self, content: str) -> str:
        """
        Strip YAML frontmatter from content if present.

        Args:
            content: Raw file content

        Returns:
            Content without frontmatter
        """
        if not content.startswith('---'):
            return content

        # Find the closing ---
        lines = content.split('\n')
        end_idx = -1
        for i, line in enumerate(lines[1:], start=1):
            if line.strip() == '---':
                end_idx = i
                break

        if end_idx == -1:
            return content  # No closing ---, return as-is

        # Return content after frontmatter
        return '\n'.join(lines[end_idx + 1:]).lstrip('\n')

    def _create_page_content(self, title: str, content: str, author: str = "AI Agent",
                            tags: Optional[List[str]] = None) -> str:
        """
        Create page content (plain markdown, no frontmatter).

        Args:
            title: Page title (unused, kept for API compatibility)
            content: Page content (markdown)
            author: Author name (unused, tracked by git)
            tags: List of tags (unused, stored in agents/index.md)

        Returns:
            Plain markdown content
        """
        # Just return content as-is - no frontmatter
        return content

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

        # Create page content (plain markdown)
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
            title: Page title/path
            content: New page content (markdown)
            author: Author name (for git commit)
            tags: List of tags (unused, kept for API compatibility)
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

        # Strip frontmatter from content if present (backwards compatibility)
        content = self._strip_frontmatter(content)

        # Write plain markdown content
        filepath.write_text(content, encoding='utf-8')

        # Git add and commit
        try:
            relative_path = filepath.relative_to(self.repo_path)
            # Use git.add() instead of index.add() - works for both normal and unmerged files
            self.repo.git.add(str(relative_path))

            # Check if we're in a merge state - if so, don't commit yet
            # The merge commit should be done explicitly via mark_for_review
            merge_head = self.repo_path / '.git' / 'MERGE_HEAD'
            if merge_head.exists():
                # In merge state - file is staged, commit will happen later
                pass
            else:
                # Only commit if there are actual changes staged
                if self.repo.index.diff("HEAD"):
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

    def rename_page(self, old_path: str, new_name: str, author: str = "User") -> Dict[str, Any]:
        """
        Rename a page (change filename only, keep in same folder).

        Supports Unicode characters (Cyrillic, etc.) and spaces in names.

        Args:
            old_path: Current page path (e.g., "home.md", "agents/index.md")
            new_name: New filename (with or without .md extension)
            author: Author name for commit

        Returns:
            Updated page dictionary with new path

        Raises:
            PageNotFoundException: If page doesn't exist
            GitWikiException: If rename fails or target exists
        """
        old_filepath = self._get_page_path(old_path)

        if not old_filepath.exists():
            raise PageNotFoundException(f"Page '{old_path}' not found")

        # Sanitize new name - keep Unicode but remove dangerous chars
        # Allow: letters (any script), numbers, spaces, hyphens, underscores
        sanitized = re.sub(r'[<>:"/\\|?*]', '', new_name)
        sanitized = sanitized.strip()

        if not sanitized:
            raise GitWikiException("Invalid filename")

        # Build new path in same directory
        new_filepath = old_filepath.parent / sanitized

        # Check if target already exists (and it's not the same file)
        if new_filepath.exists() and new_filepath != old_filepath:
            raise GitWikiException(f"Page '{sanitized}' already exists")

        # Same name, nothing to do
        if new_filepath == old_filepath:
            return self._parse_page(old_filepath)

        try:
            # Git mv
            old_rel = old_filepath.relative_to(self.repo_path)
            new_rel = new_filepath.relative_to(self.repo_path)

            self.repo.git.mv(str(old_rel), str(new_rel))
            self.repo.index.commit(
                f"Rename: {old_filepath.name} → {sanitized}",
                author=self._create_author(author)
            )

        except GitCommandError as e:
            raise GitWikiException(f"Rename failed: {e}")

        return self._parse_page(new_filepath)

    def list_pages(self, limit: Optional[int] = None, file_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List all pages in the wiki.

        Args:
            limit: Maximum number of pages to return (optional)
            file_type: Filter by file type ('markdown', 'csv', 'tsx') or None for all

        Returns:
            List of page dictionaries (path, title, file_type)
        """
        pages = []

        for filepath in self.repo_path.rglob("*"):
            # Skip directories, hidden files, and .git folder
            if not filepath.is_file() or filepath.name.startswith('.'):
                continue
            # Skip .git directory contents
            if '.git' in filepath.parts:
                continue

            # Only include supported file types
            if filepath.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue

            try:
                rel_path = str(filepath.relative_to(self.repo_path))
                ft = self._get_file_type(filepath)

                # Filter by file type if specified
                if file_type and ft != file_type:
                    continue

                pages.append({
                    "path": rel_path,
                    "title": filepath.name,
                    "file_type": ft
                })
            except Exception as e:
                print(f"Warning: Failed to parse {filepath}: {e}")
                continue

        # Sort alphabetically by path
        pages.sort(key=lambda p: p["path"].lower())

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
                '.'
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

        for filepath in self.repo_path.rglob("*"):
            # Skip .git directory
            if '.git' in filepath.parts:
                continue
            if filepath.is_file() and filepath.suffix.lower() in SUPPORTED_EXTENSIONS:
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
            raw_content = self.repo.git.show(f"{commit_sha}:{relative_path}")

            # Strip frontmatter if present
            content = self._strip_frontmatter(raw_content)

            return {
                "path": str(relative_path),
                "title": filepath.name,
                "content": content,
                "revision": commit_sha[:7],
                "has_conflicts": "<<<<<<" in raw_content or "=======" in raw_content
            }

        except GitCommandError as e:
            raise GitWikiException(f"Failed to get revision {commit_sha}: {e}")

    # Page Tree and Folder Operations

    def get_page_tree(self) -> List[Dict[str, Any]]:
        """
        Get hierarchical tree of all pages and folders.

        Returns:
            List of tree items, each with id, title, path, type, file_type, children
            Sorted alphabetically.
        """
        def build_tree(directory: Path, parent_path: Optional[str] = None) -> List[Dict]:
            items = []

            if not directory.exists():
                return items

            for entry in directory.iterdir():
                if entry.name.startswith('.'):
                    continue

                if entry.is_dir():
                    rel_path = str(entry.relative_to(self.repo_path))
                    item = {
                        "id": rel_path,
                        "title": entry.name,
                        "path": rel_path,
                        "type": "folder",
                        "parent_path": parent_path,
                        "children": build_tree(entry, rel_path)
                    }
                    items.append(item)
                elif entry.is_file():
                    try:
                        rel_path = str(entry.relative_to(self.repo_path))
                        # Get file type (returns 'unknown' for unsupported extensions)
                        file_type = GitWiki._get_file_type(entry)
                        # Remove extension for id (if has extension)
                        item_id = rel_path.rsplit('.', 1)[0] if '.' in entry.name else rel_path
                        item = {
                            "id": item_id,
                            "title": entry.name,
                            "path": rel_path,
                            "type": "page",
                            "file_type": file_type,
                            "parent_path": parent_path,
                            "children": None
                        }
                        items.append(item)
                    except Exception as e:
                        print(f"Warning: Failed to parse {entry}: {e}")
                        continue

            # Sort alphabetically by title (filename)
            items.sort(key=lambda x: x["title"].lower())
            return items

        return build_tree(self.repo_path)

    def create_folder(self, name: str, parent_path: Optional[str] = None,
                     author: str = "System") -> Dict[str, Any]:
        """
        Create a new folder with automatic ordering.

        Args:
            name: Folder name (will be converted to slug)
            parent_path: Parent folder path (None for root)
            author: Author name for commit

        Returns:
            Dictionary with folder info

        Raises:
            GitWikiException: If folder already exists or creation fails
        """
        # Convert name to slug
        slug = re.sub(r'[^\w\s-]', '', name.lower())
        slug = re.sub(r'[-\s]+', '-', slug).strip('-')
        if not slug:
            slug = "untitled"

        # Determine parent directory
        if parent_path:
            parent_dir = self.repo_path / parent_path
            if not parent_dir.is_dir():
                raise GitWikiException(f"Parent folder '{parent_path}' not found")
        else:
            parent_dir = self.repo_path

        # Use plain folder name - no automatic numbering
        folder_path = parent_dir / slug

        if folder_path.exists():
            raise GitWikiException(f"Folder '{name}' already exists")

        # Create directory
        folder_path.mkdir(parents=True)

        # Add .gitkeep to track empty folder
        gitkeep = folder_path / ".gitkeep"
        gitkeep.write_text("")

        # Git add and commit
        try:
            relative_path = gitkeep.relative_to(self.repo_path)
            self.repo.index.add([str(relative_path)])
            self.repo.index.commit(f"Create folder: {name}", author=self._create_author(author))
        except GitCommandError as e:
            # Rollback
            gitkeep.unlink()
            folder_path.rmdir()
            raise GitWikiException(f"Git commit failed: {e}")

        rel_path = str(folder_path.relative_to(self.repo_path))
        return {
            "id": rel_path,
            "title": name,
            "path": rel_path,
            "type": "folder",
            "parent_path": parent_path,
            "children": []
        }

    def delete_folder(self, path: str, author: str = "System") -> bool:
        """
        Delete a folder and all its contents recursively.

        Args:
            path: Folder path relative to wiki root
            author: Author name for commit

        Returns:
            True if deleted successfully

        Raises:
            GitWikiException: If folder doesn't exist or deletion fails
        """
        folder_path = self.repo_path / path

        if not folder_path.exists():
            raise GitWikiException(f"Folder '{path}' not found")

        if not folder_path.is_dir():
            raise GitWikiException(f"'{path}' is not a folder")

        try:
            relative_path = folder_path.relative_to(self.repo_path)
            has_tracked_files = False

            # Try git rm -r to remove tracked files
            try:
                self.repo.git.rm('-r', str(relative_path))
                has_tracked_files = True
            except GitCommandError:
                # No tracked files - folder is empty or has only untracked files
                pass

            # Remove any remaining untracked files/folders from filesystem
            import shutil
            if folder_path.exists():
                shutil.rmtree(folder_path)

            # Commit if we removed tracked files
            if has_tracked_files:
                self.repo.index.commit(f"Delete folder: {path}", author=self._create_author(author))

        except Exception as e:
            raise GitWikiException(f"Failed to delete folder: {e}")

        return True

    def move_item(self, source_path: str, target_parent: Optional[str],
                 new_order: int, author: str = "System") -> Dict[str, Any]:
        """
        Move a page or folder to a new location.

        Files keep their original names - no automatic numbering.

        Args:
            source_path: Current path of item (relative to wiki root)
            target_parent: Target parent folder path (None for root)
            new_order: Ignored (kept for API compatibility)
            author: Author name for commit

        Returns:
            Dictionary with new path info

        Raises:
            PageNotFoundException: If source item not found
            GitWikiException: If target folder not found or move fails
        """
        source = self.repo_path / source_path

        if not source.exists():
            raise PageNotFoundException(f"Item '{source_path}' not found")

        is_folder = source.is_dir()

        # Determine target directory
        if target_parent:
            target_dir = self.repo_path / target_parent
            if not target_dir.is_dir():
                raise GitWikiException(f"Target folder '{target_parent}' not found")
            # Prevent moving folder into itself or its descendants
            if is_folder:
                target_resolved = target_dir.resolve()
                source_resolved = source.resolve()
                if target_resolved == source_resolved or str(target_resolved).startswith(str(source_resolved) + '/'):
                    raise GitWikiException("Cannot move folder into itself or its descendants")
        else:
            target_dir = self.repo_path

        # Keep original filename - no automatic numbering
        target_path = target_dir / source.name

        # Check if target already exists
        if target_path.exists() and target_path != source:
            raise GitWikiException(f"Item '{source.name}' already exists in target folder")

        try:
            # Git move
            source_rel = source.relative_to(self.repo_path)
            target_rel = target_path.relative_to(self.repo_path)

            self.repo.git.mv(str(source_rel), str(target_rel))

            self.repo.index.commit(f"Move {source_path} to {target_rel}",
                                  author=self._create_author(author))

        except GitCommandError as e:
            raise GitWikiException(f"Failed to move item: {e}")

        new_rel_path = str(target_path.relative_to(self.repo_path))
        return {
            "path": new_rel_path,
            "parent_path": target_parent
        }

    # Git Branch Operations

    def get_current_branch(self) -> str:
        """
        Get the name of the currently active branch.

        Returns:
            Current branch name

        Raises:
            GitWikiException: If operation fails
        """
        try:
            return self.repo.active_branch.name
        except Exception as e:
            raise GitWikiException(f"Failed to get current branch: {e}")

    def list_branches(self) -> List[str]:
        """
        List all branches in the repository.

        Returns:
            List of branch names

        Raises:
            GitWikiException: If operation fails
        """
        try:
            return [branch.name for branch in self.repo.branches]
        except Exception as e:
            raise GitWikiException(f"Failed to list branches: {e}")

    def checkout_branch(self, branch_name: str) -> bool:
        """
        Switch to an existing branch.

        Args:
            branch_name: Name of the branch to checkout

        Returns:
            True if successful

        Raises:
            GitWikiException: If branch doesn't exist or checkout fails
        """
        try:
            if branch_name not in [b.name for b in self.repo.branches]:
                raise GitWikiException(f"Branch '{branch_name}' does not exist")

            self.repo.git.checkout(branch_name)
            return True
        except GitCommandError as e:
            raise GitWikiException(f"Failed to checkout branch '{branch_name}': {e}")

    def create_branch(self, branch_name: str, from_branch: str = "main", checkout: bool = True) -> str:
        """
        Create a new branch from an existing branch.

        Args:
            branch_name: Name of the new branch
            from_branch: Branch to create from (default: "main")
            checkout: Whether to checkout the new branch (default: True)

        Returns:
            Name of the created branch

        Raises:
            GitWikiException: If branch already exists or creation fails
        """
        try:
            # Check if branch already exists
            if branch_name in [b.name for b in self.repo.branches]:
                raise GitWikiException(f"Branch '{branch_name}' already exists")

            # Check if from_branch exists
            if from_branch not in [b.name for b in self.repo.branches]:
                raise GitWikiException(f"Source branch '{from_branch}' does not exist")

            # Create new branch from the specified branch
            new_branch = self.repo.create_head(branch_name, from_branch)

            # Checkout if requested
            if checkout:
                new_branch.checkout()

            return branch_name
        except GitCommandError as e:
            raise GitWikiException(f"Failed to create branch '{branch_name}': {e}")

    def delete_branch(self, branch_name: str, force: bool = False) -> bool:
        """
        Delete a branch.

        Args:
            branch_name: Name of the branch to delete
            force: Force deletion even if branch has unmerged changes

        Returns:
            True if successful

        Raises:
            GitWikiException: If branch doesn't exist or deletion fails
        """
        try:
            if branch_name not in [b.name for b in self.repo.branches]:
                raise GitWikiException(f"Branch '{branch_name}' does not exist")

            # Can't delete current branch
            if branch_name == self.repo.active_branch.name:
                raise GitWikiException(f"Cannot delete current branch '{branch_name}'")

            # Delete branch
            self.repo.delete_head(branch_name, force=force)
            return True
        except GitCommandError as e:
            raise GitWikiException(f"Failed to delete branch '{branch_name}': {e}")

    def merge_branch(self, source_branch: str, target_branch: str = None,
                    author: str = "AI Agent", no_ff: bool = True) -> bool:
        """
        Merge source branch into target branch.

        Args:
            source_branch: Branch to merge from
            target_branch: Branch to merge into (default: current branch)
            author: Author for merge commit
            no_ff: Create merge commit even if fast-forward is possible

        Returns:
            True if successful

        Raises:
            GitWikiException: If merge fails or branches don't exist
        """
        try:
            # If target not specified, use current branch
            if target_branch is None:
                target_branch = self.repo.active_branch.name

            # Verify branches exist
            branch_names = [b.name for b in self.repo.branches]
            if source_branch not in branch_names:
                raise GitWikiException(f"Source branch '{source_branch}' does not exist")
            if target_branch not in branch_names:
                raise GitWikiException(f"Target branch '{target_branch}' does not exist")

            # Save current branch to restore later if needed
            original_branch = self.repo.active_branch.name

            # Checkout target branch
            if original_branch != target_branch:
                self.repo.git.checkout(target_branch)

            # Perform merge
            merge_args = ['--no-ff'] if no_ff else []
            self.repo.git.merge(source_branch, *merge_args)

            return True
        except GitCommandError as e:
            # Check if it's a merge conflict
            if "CONFLICT" in str(e) or "conflict" in str(e).lower():
                raise GitWikiException(f"Merge conflict: {e}")
            raise GitWikiException(f"Failed to merge '{source_branch}' into '{target_branch}': {e}")

    def tag_branch(self, tag_name: str, branch_name: str = None, message: str = None) -> bool:
        """
        Create a tag at a branch's current commit.

        Args:
            tag_name: Name of the tag to create
            branch_name: Branch to tag (default: current branch)
            message: Optional tag message

        Returns:
            True if successful

        Raises:
            GitWikiException: If tagging fails
        """
        try:
            # Get the commit to tag
            if branch_name:
                if branch_name not in [b.name for b in self.repo.branches]:
                    raise GitWikiException(f"Branch '{branch_name}' does not exist")
                commit = self.repo.branches[branch_name].commit
            else:
                commit = self.repo.head.commit

            # Create tag
            if message:
                self.repo.create_tag(tag_name, ref=commit, message=message)
            else:
                self.repo.create_tag(tag_name, ref=commit)

            return True
        except GitCommandError as e:
            if "already exists" in str(e):
                raise GitWikiException(f"Tag '{tag_name}' already exists")
            raise GitWikiException(f"Failed to create tag '{tag_name}': {e}")

    def get_branch_tags(self, branch_name: str = None) -> List[str]:
        """
        Get all tags pointing to commits in a branch.

        Args:
            branch_name: Branch to check (default: current branch)

        Returns:
            List of tag names

        Raises:
            GitWikiException: If operation fails
        """
        try:
            if branch_name:
                if branch_name not in [b.name for b in self.repo.branches]:
                    raise GitWikiException(f"Branch '{branch_name}' does not exist")
                commit = self.repo.branches[branch_name].commit
            else:
                commit = self.repo.head.commit

            # Find tags pointing to this commit
            tags = [tag.name for tag in self.repo.tags if tag.commit == commit]
            return tags
        except Exception as e:
            raise GitWikiException(f"Failed to get tags: {e}")

    def list_branches_with_prefix(self, prefix: str) -> List[str]:
        """
        List all branches matching a prefix pattern.

        Args:
            prefix: Branch name prefix (e.g., "agent/")

        Returns:
            List of matching branch names

        Raises:
            GitWikiException: If operation fails
        """
        try:
            all_branches = [branch.name for branch in self.repo.branches]
            return [b for b in all_branches if b.startswith(prefix)]
        except Exception as e:
            raise GitWikiException(f"Failed to list branches: {e}")

    def get_diff(self, ref1: str, ref2: str, context_lines: int = 3) -> str:
        """
        Get unified diff between two refs (branches, commits, tags).

        Args:
            ref1: First reference (e.g., "main")
            ref2: Second reference (e.g., "agent/checker/123")
            context_lines: Number of context lines in diff

        Returns:
            Unified diff as string

        Raises:
            GitWikiException: If refs don't exist or operation fails
        """
        try:
            # Use --ignore-cr-at-eol to ignore CRLF vs LF differences
            diff = self.repo.git.diff('--ignore-cr-at-eol', f'-U{context_lines}', ref1, ref2)
            return diff
        except GitCommandError as e:
            raise GitWikiException(f"Failed to get diff between '{ref1}' and '{ref2}': {e}")

    def get_diff_stat(self, ref1: str, ref2: str) -> Dict[str, Any]:
        """
        Get diff statistics between two refs.

        Args:
            ref1: First reference (e.g., "main")
            ref2: Second reference (e.g., "agent/checker/123")

        Returns:
            Dictionary with diff statistics

        Raises:
            GitWikiException: If refs don't exist or operation fails
        """
        try:
            # Get stat output (ignore CRLF vs LF differences)
            stat = self.repo.git.diff('--ignore-cr-at-eol', '--stat', ref1, ref2)

            # Get file list with changes
            files_changed = []
            lines = stat.strip().split('\n')

            # Parse individual file changes
            for line in lines[:-1]:  # Skip summary line
                if '|' in line:
                    parts = line.split('|')
                    file_path = parts[0].strip()
                    changes = parts[1].strip()
                    files_changed.append({
                        "path": file_path,
                        "changes": changes
                    })

            # Parse summary line (e.g., "3 files changed, 45 insertions(+), 12 deletions(-)")
            summary = lines[-1] if lines else ""

            return {
                "files_changed": files_changed,
                "summary": summary,
                "raw_stat": stat
            }
        except GitCommandError as e:
            raise GitWikiException(f"Failed to get diff stats: {e}")

    def get_commit_message(self, branch_name: str, format_str: str = "%s%n%n%b") -> str:
        """
        Get the commit message from a branch's HEAD.

        Args:
            branch_name: Branch name
            format_str: Git log format string (default: subject + body)

        Returns:
            Commit message

        Raises:
            GitWikiException: If branch doesn't exist or operation fails
        """
        try:
            if branch_name not in [b.name for b in self.repo.branches]:
                raise GitWikiException(f"Branch '{branch_name}' does not exist")

            message = self.repo.git.log('-1', f'--format={format_str}', branch_name)
            return message.strip()
        except GitCommandError as e:
            raise GitWikiException(f"Failed to get commit message: {e}")

    def get_page_content_at_ref(self, title: str, ref: str) -> str:
        """
        Get page content at specific git ref (branch/commit/tag).

        Args:
            title: Page title or path
            ref: Git reference (branch name, commit SHA, or tag)

        Returns:
            Page content as string, or empty string if page doesn't exist at ref
        """
        filepath = self._get_page_path(title)
        relative_path = filepath.relative_to(self.repo_path)

        try:
            # Get file content at specific ref
            raw_content = self.repo.git.show(f"{ref}:{relative_path}")
            # Strip frontmatter if present
            return self._strip_frontmatter(raw_content)
        except GitCommandError:
            return ""  # Page doesn't exist at ref

    def get_page_tree_at_ref(self, ref: str) -> List[Dict[str, Any]]:
        """
        Get hierarchical tree of all pages and folders at a specific git ref.

        Args:
            ref: Git reference (branch name, commit SHA, or tag)

        Returns:
            List of tree items, same structure as get_page_tree()
        """
        try:
            # List all files at ref using git ls-tree
            output = self.repo.git.ls_tree('-r', '--name-only', ref)
            if not output.strip():
                return []

            # Parse file paths and build tree structure
            files = output.strip().split('\n')
            tree_dict: Dict[str, Dict] = {}

            for file_path in files:
                # Skip hidden files and unsupported extensions
                parts = file_path.split('/')
                if any(p.startswith('.') for p in parts):
                    continue

                ext = '.' + file_path.split('.')[-1].lower() if '.' in file_path else ''
                if ext not in SUPPORTED_EXTENSIONS:
                    continue

                # Build tree structure
                current_dict = tree_dict
                for i, part in enumerate(parts[:-1]):
                    folder_path = '/'.join(parts[:i+1])
                    if folder_path not in current_dict:
                        current_dict[folder_path] = {
                            "id": folder_path,
                            "title": part,
                            "path": folder_path,
                            "type": "folder",
                            "parent_path": '/'.join(parts[:i]) if i > 0 else None,
                            "_children": {}
                        }
                    current_dict = current_dict[folder_path]["_children"]

                # Add file
                file_name = parts[-1]
                title = file_name.rsplit('.', 1)[0] if '.' in file_name else file_name
                file_type = ext[1:] if ext else 'md'
                current_dict[file_path] = {
                    "id": file_path,
                    "title": title,
                    "path": file_path,
                    "type": "page",
                    "file_type": file_type,
                    "parent_path": '/'.join(parts[:-1]) if len(parts) > 1 else None
                }

            # Convert dict to list recursively
            def dict_to_list(d: Dict) -> List[Dict]:
                items = []
                for key, item in sorted(d.items()):
                    if item.get("type") == "folder":
                        children = dict_to_list(item.pop("_children", {}))
                        item["children"] = children
                    items.append(item)
                return items

            return dict_to_list(tree_dict)

        except GitCommandError:
            return []  # Branch doesn't exist or other git error

    def get_diff_stats_by_page(self, base: str, target: str) -> Dict[str, Dict[str, int]]:
        """
        Get per-page diff statistics between two refs.

        Args:
            base: Base ref (e.g., "main")
            target: Target ref (e.g., "thread/feature-x")

        Returns:
            Dictionary mapping page paths to {additions, deletions, file_type}
        """
        try:
            # Use --ignore-cr-at-eol to ignore CRLF vs LF differences
            result = self.repo.git.diff('--numstat', '--ignore-cr-at-eol', base, target)
            stats = {}

            for line in result.strip().split('\n'):
                if not line:
                    continue
                parts = line.split('\t')
                if len(parts) == 3:
                    adds, dels, path = parts
                    # Skip hidden files
                    if path.startswith('.') or '/.' in path:
                        continue
                    # Only include files with supported extensions
                    ext = '.' + path.rsplit('.', 1)[-1] if '.' in path else ''
                    if ext.lower() in SUPPORTED_EXTENSIONS:
                        stats[path] = {
                            "additions": int(adds) if adds != '-' else 0,
                            "deletions": int(dels) if dels != '-' else 0,
                            "file_type": self._get_file_type(Path(path))
                        }

            return stats
        except GitCommandError:
            return {}

    # ─────────────────────────────────────────────────────────────────────────────
    # Search and Pattern Matching
    # ─────────────────────────────────────────────────────────────────────────────

    def search_pages_regex(
        self,
        pattern: str,
        limit: int = 50,
        context_lines: int = 0,
        case_sensitive: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Search pages using regex pattern, returning matches with line numbers and context.

        Args:
            pattern: Regex pattern to search for
            limit: Maximum number of matches to return
            context_lines: Number of context lines before/after each match
            case_sensitive: Whether search is case-sensitive (default: False)

        Returns:
            List of match dictionaries with page_title, page_path, line_number,
            content, context_before, context_after
        """
        import re as regex_module

        matches = []
        flags = 0 if case_sensitive else regex_module.IGNORECASE

        try:
            compiled = regex_module.compile(pattern, flags)
        except regex_module.error as e:
            return [{"error": f"Invalid regex pattern: {e}"}]

        for filepath in self.repo_path.rglob("*"):
            # Skip .git directory
            if '.git' in filepath.parts:
                continue
            if not filepath.is_file() or filepath.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue

            try:
                raw_content = filepath.read_text(encoding='utf-8')
                file_type = self._get_file_type(filepath)
                # Strip frontmatter if present (for markdown files)
                if file_type == 'markdown':
                    page_content = self._strip_frontmatter(raw_content)
                else:
                    page_content = raw_content
                page_path = str(filepath.relative_to(self.repo_path))
                lines = page_content.split('\n')

                for line_num, line in enumerate(lines, start=1):
                    if compiled.search(line):
                        # Get context lines
                        start_ctx = max(0, line_num - 1 - context_lines)
                        end_ctx = min(len(lines), line_num + context_lines)

                        context_before = lines[start_ctx:line_num - 1]
                        context_after = lines[line_num:end_ctx]

                        matches.append({
                            "page_title": filepath.name,
                            "page_path": page_path,
                            "line_number": line_num,
                            "content": line,
                            "context_before": context_before,
                            "context_after": context_after
                        })

                        if len(matches) >= limit:
                            return matches

            except Exception:
                continue

        return matches

    def glob_pages(self, pattern: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Find pages matching glob pattern on titles/paths.

        Supports:
        - * matches any characters within a path segment
        - ** matches any characters including path separators
        - ? matches single character

        Args:
            pattern: Glob pattern (e.g., "docs/*", "**/*api*", "*.csv")
            limit: Maximum results to return

        Returns:
            List of matching pages with title, path, file_type
        """
        import fnmatch

        # Normalize pattern - add wildcard if no extension specified
        has_extension = any(pattern.endswith(ext) for ext in SUPPORTED_EXTENSIONS)
        if not has_extension and not pattern.endswith('*'):
            search_pattern = pattern + '*'
        else:
            search_pattern = pattern

        # Handle ** for recursive matching
        if '**' in search_pattern:
            # Convert ** to fnmatch-compatible pattern
            search_pattern = search_pattern.replace('**/', '*')
            search_pattern = search_pattern.replace('**', '*')

        results = []

        for filepath in self.repo_path.rglob("*"):
            # Skip .git directory
            if '.git' in filepath.parts:
                continue
            if not filepath.is_file() or filepath.suffix.lower() not in SUPPORTED_EXTENSIONS:
                continue

            rel_path = str(filepath.relative_to(self.repo_path))
            # Remove extension for matching against pattern
            rel_path_no_ext = rel_path.rsplit('.', 1)[0] if '.' in rel_path else rel_path

            # Match against both with and without extension
            if fnmatch.fnmatch(rel_path, search_pattern) or \
               fnmatch.fnmatch(rel_path_no_ext, search_pattern) or \
               fnmatch.fnmatch(rel_path.lower(), search_pattern.lower()) or \
               fnmatch.fnmatch(rel_path_no_ext.lower(), search_pattern.lower()):

                results.append({
                    "title": filepath.name,
                    "path": rel_path,
                    "file_type": self._get_file_type(filepath),
                    "updated_at": None  # Legacy field
                })

                if len(results) >= limit:
                    break

        # Sort alphabetically by path
        results.sort(key=lambda x: x["path"].lower())
        return results
