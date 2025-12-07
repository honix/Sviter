"""
Git operations for thread management.

Provides safe branch operations with proper cleanup and error handling.
"""

from pathlib import Path
from typing import Dict, Any, Optional
from storage.git_wiki import GitWiki


WORKTREES_DIR = ".worktrees"


def create_worktree(wiki: GitWiki, branch_name: str) -> Path:
    """
    Create a worktree for a thread branch.

    Worktrees allow multiple branches to be checked out simultaneously
    in separate directories, enabling concurrent thread execution.

    Args:
        wiki: GitWiki instance (main wiki)
        branch_name: Branch name (e.g., 'thread/task/20250607-123456')

    Returns:
        Path to the created worktree directory
    """
    worktrees_path = Path(wiki.repo_path) / WORKTREES_DIR
    worktrees_path.mkdir(exist_ok=True)

    # Sanitize branch name for directory (replace / with -)
    safe_name = branch_name.replace("/", "-")
    worktree_path = worktrees_path / safe_name

    # Create the worktree with the branch checked out
    wiki.repo.git.worktree("add", str(worktree_path), branch_name)

    return worktree_path


def remove_worktree(wiki: GitWiki, branch_name: str) -> None:
    """
    Remove a worktree after thread completion.

    Should be called during accept/reject before deleting the branch.

    Args:
        wiki: GitWiki instance (main wiki)
        branch_name: Branch name whose worktree to remove
    """
    worktrees_path = Path(wiki.repo_path) / WORKTREES_DIR
    safe_name = branch_name.replace("/", "-")
    worktree_path = worktrees_path / safe_name

    if worktree_path.exists():
        try:
            wiki.repo.git.worktree("remove", str(worktree_path), "--force")
        except Exception as e:
            print(f"Warning: Could not remove worktree {worktree_path}: {e}")


def cleanup_orphaned_worktrees(wiki: GitWiki) -> None:
    """
    Remove any orphaned worktrees from previous crashed sessions.

    Should be called on server startup.

    Args:
        wiki: GitWiki instance
    """
    try:
        # git worktree prune removes stale worktree entries
        wiki.repo.git.worktree("prune")

        # Also clean up the .worktrees directory
        worktrees_path = Path(wiki.repo_path) / WORKTREES_DIR
        if worktrees_path.exists():
            # List current valid worktrees
            worktree_list = wiki.repo.git.worktree("list", "--porcelain")
            valid_paths = set()
            for line in worktree_list.split('\n'):
                if line.startswith('worktree '):
                    valid_paths.add(Path(line[9:]))

            # Remove directories that aren't valid worktrees
            for item in worktrees_path.iterdir():
                if item.is_dir() and item not in valid_paths:
                    import shutil
                    shutil.rmtree(item)
                    print(f"Cleaned up orphaned worktree directory: {item}")
    except Exception as e:
        print(f"Warning: Error during worktree cleanup: {e}")


def prepare_branch(wiki: GitWiki, branch_name: str) -> Optional[str]:
    """
    Prepare a new thread branch from main.

    Pulls latest main and creates the branch without checking it out.

    Args:
        wiki: GitWiki instance
        branch_name: Name for the new branch (e.g., 'thread/task/20250606-123456')

    Returns:
        Error message if failed, None on success
    """
    original_branch = None
    try:
        original_branch = wiki.get_current_branch()
        if original_branch != "main":
            wiki.checkout_branch("main")

        # Pull latest from remote
        try:
            wiki.repo.remotes.origin.pull("main")
            print(f"Pulled latest main for branch {branch_name}")
        except Exception as pull_error:
            print(f"Could not pull main (might be local-only): {pull_error}")

        # Create branch without checkout
        wiki.create_branch(branch_name, from_branch="main", checkout=False)
        return None

    except Exception as e:
        return f"Failed to create branch: {e}"

    finally:
        # Restore original branch if we switched away
        if original_branch and original_branch != "main":
            try:
                wiki.checkout_branch(original_branch)
            except Exception as restore_error:
                print(f"Could not restore branch {original_branch}: {restore_error}")


def checkout_thread(wiki: GitWiki, branch: str) -> Optional[str]:
    """
    Checkout a thread's branch.

    Args:
        wiki: GitWiki instance
        branch: Branch name to checkout

    Returns:
        Error message if failed, None on success
    """
    try:
        wiki.checkout_branch(branch)
        return None
    except Exception as e:
        return f"Failed to checkout branch: {e}"


def return_to_main(wiki: GitWiki) -> None:
    """
    Switch back to main branch.

    Silently handles errors - used for cleanup.

    Args:
        wiki: GitWiki instance
    """
    try:
        wiki.checkout_branch("main")
    except Exception:
        pass


def merge_thread(wiki: GitWiki, branch: str) -> Dict[str, Any]:
    """
    Merge thread branch into main.

    Args:
        wiki: GitWiki instance
        branch: Thread branch to merge

    Returns:
        Dict with:
            - success: bool
            - conflict: bool (True if merge conflict)
            - error: str or None
    """
    try:
        # Ensure we're on main
        wiki.checkout_branch("main")

        # Try to merge
        wiki.merge_branch(branch, "main")

        return {"success": True, "conflict": False, "error": None}

    except Exception as merge_error:
        error_str = str(merge_error).lower()

        if "conflict" in error_str:
            # Abort the failed merge
            try:
                wiki.repo.git.merge("--abort")
            except Exception:
                pass

            return {"success": False, "conflict": True, "error": None}
        else:
            return {"success": False, "conflict": False, "error": str(merge_error)}


def merge_main_into_thread(wiki: GitWiki, branch: str) -> Optional[str]:
    """
    Merge main into thread branch (for conflict resolution).

    When using worktrees, the wiki already has the thread branch checked out,
    so no checkout is needed.

    Args:
        wiki: GitWiki instance (can be main wiki or thread's worktree wiki)
        branch: Thread branch to update

    Returns:
        Error message if failed, None on success (conflicts may still exist)
    """
    try:
        # Only checkout if not already on the branch (for worktrees, we're already there)
        current = wiki.get_current_branch()
        if current != branch:
            wiki.checkout_branch(branch)

        try:
            wiki.merge_branch("main", branch)
        except Exception:
            # Conflicts expected - that's why we're here
            pass

        return None

    except Exception as e:
        return f"Failed to merge main into thread: {e}"


def delete_thread_branch(wiki: GitWiki, branch: str) -> None:
    """
    Delete a thread branch.

    Silently handles errors - used for cleanup.

    Args:
        wiki: GitWiki instance
        branch: Branch to delete
    """
    try:
        wiki.checkout_branch("main")  # Can't delete current branch
        wiki.delete_branch(branch, force=True)
    except Exception:
        pass


def get_diff_stats(wiki: GitWiki, branch: str) -> Optional[Dict[str, Any]]:
    """
    Get diff statistics between main and thread branch.

    Args:
        wiki: GitWiki instance
        branch: Thread branch to compare

    Returns:
        Dict with files_changed, lines_added, lines_removed, files list
        or None if failed
    """
    try:
        return wiki.get_diff_stat("main", branch)
    except Exception:
        return None
