"""
Git operations for thread management.

Provides safe branch operations with proper cleanup and error handling.
"""

from pathlib import Path
from typing import Dict, Any, Optional
from storage.git_wiki import GitWiki


# Worktrees stored in backend/data/worktrees/ (next to database)
WORKTREES_DIR = Path(__file__).parent.parent / "data" / "worktrees"


def get_worktrees_path() -> Path:
    """Get the worktrees directory path, creating it if needed."""
    WORKTREES_DIR.mkdir(parents=True, exist_ok=True)
    return WORKTREES_DIR


def init_thread_support(wiki: GitWiki) -> None:
    """
    Initialize thread support.

    Creates worktrees directory and cleans up orphaned worktrees.
    Should be called on server startup.

    Args:
        wiki: GitWiki instance
    """
    get_worktrees_path()  # Ensure directory exists
    cleanup_orphaned_worktrees(wiki)


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
    worktrees_path = get_worktrees_path()

    # Sanitize branch name for directory (replace / with -)
    safe_name = branch_name.replace("/", "-")
    worktree_path = worktrees_path / safe_name

    # Create the worktree with the branch checked out
    wiki.repo.git.worktree("add", str(worktree_path), branch_name)

    return worktree_path


def remove_worktree(wiki: GitWiki, branch_name: str) -> bool:
    """
    Remove a worktree after thread completion.

    Should be called during accept/reject before deleting the branch.
    Returns True if worktree was successfully removed or didn't exist.

    Args:
        wiki: GitWiki instance (main wiki)
        branch_name: Branch name whose worktree to remove

    Returns:
        True if worktree removed successfully, False otherwise
    """
    worktrees_path = get_worktrees_path()
    safe_name = branch_name.replace("/", "-")
    worktree_path = worktrees_path / safe_name

    if not worktree_path.exists():
        # Already gone, prune any stale entries
        try:
            wiki.repo.git.worktree("prune")
        except Exception:
            pass
        return True

    # Try to remove the worktree
    try:
        wiki.repo.git.worktree("remove", str(worktree_path), "--force")
        return True
    except Exception as e:
        print(f"Warning: First worktree remove attempt failed: {e}")

    # Retry with prune first
    try:
        wiki.repo.git.worktree("prune")
        wiki.repo.git.worktree("remove", str(worktree_path), "--force")
        return True
    except Exception as e:
        print(f"Warning: Could not remove worktree {worktree_path} after prune: {e}")

    # Last resort: manually remove directory
    try:
        import shutil
        shutil.rmtree(worktree_path)
        wiki.repo.git.worktree("prune")
        print(f"Manually removed worktree directory: {worktree_path}")
        return True
    except Exception as e:
        print(f"Error: Failed to manually remove worktree {worktree_path}: {e}")
        return False


def cleanup_orphaned_worktrees(wiki: GitWiki) -> None:
    """
    Remove worktrees not associated with active threads in the database.

    Should be called on server startup/shutdown.

    Args:
        wiki: GitWiki instance
    """
    from db import list_worker_threads

    try:
        # Get active worktree paths from database
        active_threads = list_worker_threads()
        active_worktree_paths = {
            t['worktree_path'] for t in active_threads
            if t.get('worktree_path')
        }

        # Get all worktrees in data/worktrees directory
        worktrees_path = get_worktrees_path()
        if not worktrees_path.exists():
            return

        # Remove worktrees not in database
        for item in worktrees_path.iterdir():
            if not item.is_dir():
                continue

            item_str = str(item)
            if item_str not in active_worktree_paths:
                # Remove from git first
                try:
                    wiki.repo.git.worktree("remove", "--force", str(item))
                except Exception:
                    pass  # May already be invalid

                # Then remove directory if still exists
                if item.exists():
                    import shutil
                    shutil.rmtree(item)

                print(f"Cleaned up orphaned worktree: {item.name}")

        # Prune any stale git worktree entries
        wiki.repo.git.worktree("prune")

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
