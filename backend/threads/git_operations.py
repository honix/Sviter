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

    Creates worktrees directory, cleans up orphaned worktrees,
    and recreates worktrees for active threads.
    Should be called on server startup.

    Args:
        wiki: GitWiki instance
    """
    get_worktrees_path()  # Ensure directory exists
    cleanup_orphaned_worktrees(wiki)
    recreate_missing_worktrees(wiki)


def recreate_missing_worktrees(wiki: GitWiki) -> None:
    """
    Recreate worktrees for active threads that are missing them.

    On server restart, worktrees are cleaned up. This function
    recreates them for threads that are still active.

    Args:
        wiki: GitWiki instance
    """
    from db import list_worker_threads, update_thread

    try:
        active_threads = list_worker_threads()

        for thread in active_threads:
            branch = thread.get('branch')
            status = thread.get('status', '')

            # Skip threads without branches or in terminal states
            if not branch or status in ('accepted', 'archived', 'rejected'):
                continue

            # Check if worktree exists
            worktree_path = thread.get('worktree_path')
            if worktree_path and Path(worktree_path).exists():
                continue  # Worktree exists, skip

            # Recreate worktree
            try:
                new_path = create_worktree(wiki, branch)
                update_thread(thread['id'], worktree_path=str(new_path))
                print(f"✅ Recreated worktree for thread {thread['id']}: {new_path}")
            except Exception as e:
                print(f"⚠️ Failed to recreate worktree for thread {thread['id']}: {e}")

    except Exception as e:
        print(f"Warning: Error recreating worktrees: {e}")


def create_worktree(wiki: GitWiki, branch_name: str) -> Path:
    """
    Create a worktree for a thread branch.

    Worktrees allow multiple branches to be checked out simultaneously
    in separate directories, enabling concurrent thread execution.

    Args:
        wiki: GitWiki instance (main wiki)
        branch_name: Branch name (e.g., 'thread/new-thread-5a721c')

    Returns:
        Path to the created worktree directory
    """
    worktrees_path = get_worktrees_path()

    # Use just the name part without thread/ prefix for cleaner directory names
    # e.g., 'thread/new-thread-5a721c' -> 'new-thread-5a721c'
    safe_name = branch_name.replace("thread/", "")
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
    # Match create_worktree naming: strip thread/ prefix
    safe_name = branch_name.replace("thread/", "")
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
        # Handle detached HEAD state gracefully
        try:
            original_branch = wiki.get_current_branch()
        except Exception:
            # Detached HEAD - just checkout main directly
            original_branch = None

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


def merge_thread(wiki: GitWiki, branch: str, author: str = "System",
                 author_email: Optional[str] = None) -> Dict[str, Any]:
    """
    Merge thread branch into main.

    Args:
        wiki: GitWiki instance
        branch: Thread branch to merge
        author: Author name for the merge commit
        author_email: Author's email for the merge commit

    Returns:
        Dict with:
            - success: bool
            - conflict: bool (True if merge conflict)
            - error: str or None
    """
    try:
        # Ensure we're on main
        wiki.checkout_branch("main")

        # Try to merge with author info
        wiki.merge_branch(branch, "main", author=author, author_email=author_email)

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


def check_merge_conflicts(wiki: GitWiki, thread_branch: str) -> bool:
    """
    Check if merging thread branch into main would result in conflicts.

    Uses git merge-tree to check for conflicts without modifying the working tree.

    Args:
        wiki: GitWiki instance (main wiki)
        thread_branch: Thread branch to check

    Returns:
        True if there would be conflicts, False otherwise
    """
    try:
        # First check: if thread branch already contains main's HEAD, no conflicts possible
        # This happens after conflict resolution when main was merged into thread
        try:
            main_head = wiki.repo.git.rev_parse("main")
            # Check if main's HEAD is an ancestor of thread branch
            # merge-base --is-ancestor returns 0 if ancestor, 1 if not
            wiki.repo.git.execute(["git", "merge-base", "--is-ancestor", main_head, thread_branch])
            # If we get here (no exception), main is already in thread - no conflicts
            print(f"✅ Main ({main_head[:8]}) is already merged into {thread_branch} - no conflicts")
            return False
        except Exception:
            # main is not an ancestor of thread, need to check for conflicts
            pass

        # Find merge base
        merge_base = wiki.repo.git.merge_base("main", thread_branch)

        # Use merge-tree to check for conflicts (git 2.38+)
        # This does a "virtual merge" without touching the working tree
        try:
            result = wiki.repo.git.execute(
                ["git", "merge-tree", "--write-tree", "--no-messages", merge_base, "main", thread_branch],
                with_extended_output=True
            )
            # If successful with exit code 0, no conflicts
            return False
        except Exception as e:
            error_str = str(e).lower()
            # merge-tree returns non-zero if there are conflicts
            if "conflict" in error_str or "would be overwritten" in error_str:
                return True
            # For older git versions, fall back to dry-run merge
            pass

        # Fallback for older git: try a dry-run merge using git merge --no-commit --no-ff
        # This is more accurate than the heuristic approach
        try:
            # Save current branch
            current_branch = wiki.repo.active_branch.name

            # Checkout main
            wiki.repo.git.checkout("main")

            try:
                # Try merge with --no-commit to see if it would conflict
                wiki.repo.git.merge("--no-commit", "--no-ff", thread_branch)
                # If we get here, no conflicts - abort and return False
                wiki.repo.git.merge("--abort")
                return False
            except Exception as merge_error:
                # Abort the failed merge
                try:
                    wiki.repo.git.merge("--abort")
                except Exception:
                    pass

                error_str = str(merge_error).lower()
                if "conflict" in error_str:
                    return True
                # Other error - assume no conflicts
                return False
            finally:
                # Restore original branch
                if wiki.repo.active_branch.name != current_branch:
                    wiki.repo.git.checkout(current_branch)

        except Exception as e:
            print(f"Fallback merge check failed: {e}")
            # If fallback also fails, assume no conflicts
            return False

    except Exception as e:
        print(f"Error checking merge conflicts: {e}")
        # If we can't check, assume no conflicts and let the actual merge handle it
        return False


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


def rename_branch(wiki: GitWiki, old_branch: str, new_branch: str,
                  old_worktree_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Rename a thread branch and update its worktree if it exists.

    Args:
        wiki: GitWiki instance (main wiki)
        old_branch: Current branch name
        new_branch: New branch name
        old_worktree_path: Path to existing worktree (if any)

    Returns:
        Dict with:
            - success: bool
            - new_worktree_path: str or None (new path if worktree was moved)
            - error: str or None
    """
    import shutil

    try:
        # Rename the branch
        wiki.repo.git.branch("-m", old_branch, new_branch)

        # If there's a worktree and it exists, update its directory name
        new_worktree_path = None
        if old_worktree_path:
            old_path = Path(old_worktree_path)
            if old_path.exists():
                # Calculate new worktree path (strip thread/ prefix for cleaner names)
                worktrees_path = get_worktrees_path()
                # Use just the name part, not the full thread/name format
                name_part = new_branch.replace("thread/", "")
                new_path = worktrees_path / name_part

                if old_path != new_path:
                    try:
                        # Remove old worktree registration
                        wiki.repo.git.worktree("remove", "--force", str(old_path))
                    except Exception:
                        pass

                    # Move the directory
                    shutil.move(str(old_path), str(new_path))

                    # Re-add as worktree
                    wiki.repo.git.worktree("add", "--force", str(new_path), new_branch)
                    new_worktree_path = str(new_path)

                    wiki.repo.git.worktree("prune")
            # else: worktree doesn't exist, just rename branch (already done above)

        return {
            "success": True,
            "new_worktree_path": new_worktree_path,
            "error": None
        }

    except Exception as e:
        return {
            "success": False,
            "new_worktree_path": None,
            "error": str(e)
        }
