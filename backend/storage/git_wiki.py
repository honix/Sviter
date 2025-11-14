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
            diff = self.repo.git.diff(ref1, ref2, unified=context_lines)
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
            # Get stat output
            stat = self.repo.git.diff(ref1, ref2, stat=True)

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
