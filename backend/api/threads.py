"""
REST API endpoints for threads.

Provides CRUD operations for threads alongside WebSocket real-time features.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List

from threads.base import ThreadType, ThreadStatus
from threads.assistant import AssistantThread
from threads.worker import WorkerThread
from threads.manager import thread_manager
from threads import git_operations as git_ops
from db import (
    get_thread as db_get_thread,
    list_threads_for_user,
    list_worker_threads,
    get_thread_messages,
    can_access_thread,
    share_thread as db_share_thread,
    unshare_thread as db_unshare_thread,
    get_thread_shares,
)


router = APIRouter(prefix="/api/threads", tags=["threads"])


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────────────────────

class ThreadCreate(BaseModel):
    type: str  # "assistant" or "worker"
    name: str
    goal: Optional[str] = None  # Required for worker


class ThreadUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None  # For archiving


class ShareRequest(BaseModel):
    user_id: str


# ─────────────────────────────────────────────────────────────────────────────
# Helper to get current user (simplified - use proper auth in production)
# ─────────────────────────────────────────────────────────────────────────────

def get_current_user(user_id: str = Query(..., description="User ID")) -> str:
    """Get current user from query param (simplified auth)."""
    return user_id


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/")
async def list_threads(
    user_id: str = Depends(get_current_user),
    include_archived: bool = False,
    type: Optional[str] = None
):
    """
    List threads visible to user.

    Returns owned threads, shared threads, and all worker threads.
    """
    # Get user's threads
    user_threads = list_threads_for_user(user_id, include_archived)

    # Get all worker threads (visible to everyone)
    workers = list_worker_threads()

    # Merge and dedupe
    thread_ids = set()
    threads = []

    for t in user_threads:
        if t['id'] not in thread_ids:
            if type is None or t['type'] == type:
                thread_ids.add(t['id'])
                threads.append(t)

    for t in workers:
        if t['id'] not in thread_ids:
            if type is None or t['type'] == type:
                thread_ids.add(t['id'])
                threads.append(t)

    return {"threads": threads}


@router.post("/")
async def create_thread(
    data: ThreadCreate,
    user_id: str = Depends(get_current_user)
):
    """
    Create a new thread.

    For assistant threads, goal is optional.
    For worker threads, goal is required.
    """
    if data.type == "assistant":
        thread = AssistantThread.create(owner_id=user_id, name=data.name)
        return {"thread": thread.to_dict()}

    elif data.type == "worker":
        if not data.goal:
            raise HTTPException(status_code=400, detail="Goal is required for worker threads")

        # Use ThreadManager to create worker (handles git branch setup)
        if thread_manager is None:
            raise HTTPException(status_code=503, detail="Thread manager not initialized")

        thread = thread_manager._create_worker_thread(data.name, data.goal, user_id)

        if thread.error:
            raise HTTPException(status_code=500, detail=f"Failed to create thread: {thread.error}")

        return {"thread": thread.to_dict()}

    else:
        raise HTTPException(status_code=400, detail=f"Invalid thread type: {data.type}")


@router.get("/{thread_id}")
async def get_thread(
    thread_id: str,
    user_id: str = Depends(get_current_user),
    include_messages: bool = True
):
    """
    Get thread details.

    Optionally includes message history.
    """
    thread_data = db_get_thread(thread_id)
    if not thread_data:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Check access (workers are visible to all)
    if thread_data['type'] != 'worker' and not can_access_thread(thread_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    result = {"thread": thread_data}

    if include_messages:
        messages = get_thread_messages(thread_id)
        result["messages"] = messages

    # Add shares
    result["shared_with"] = get_thread_shares(thread_id)

    return result


@router.patch("/{thread_id}")
async def update_thread(
    thread_id: str,
    data: ThreadUpdate,
    user_id: str = Depends(get_current_user)
):
    """
    Update thread properties.

    Can update name or archive the thread.
    """
    thread_data = db_get_thread(thread_id)
    if not thread_data:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Only owner can update
    if thread_data['owner_id'] != user_id:
        raise HTTPException(status_code=403, detail="Only owner can update thread")

    # Load appropriate thread type
    if thread_data['type'] == 'assistant':
        thread = AssistantThread.from_dict(thread_data)
    else:
        thread = WorkerThread.from_dict(thread_data)

    # Apply updates
    if data.name:
        thread.name = data.name

    if data.status == 'archived':
        thread.set_status(ThreadStatus.ARCHIVED)

    thread.save()

    return {"thread": thread.to_dict()}


@router.delete("/{thread_id}")
async def delete_thread(
    thread_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Delete a thread.

    For workers, also cleans up git branch.
    """
    thread_data = db_get_thread(thread_id)
    if not thread_data:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Only owner can delete
    if thread_data['owner_id'] != user_id:
        raise HTTPException(status_code=403, detail="Only owner can delete thread")

    # Clean up via ThreadManager if available
    if thread_manager:
        await thread_manager._cleanup_thread(thread_id)
    else:
        # Manual cleanup
        if thread_data['type'] == 'worker':
            thread = WorkerThread.from_dict(thread_data)
            # Need wiki access for cleanup
            # This is a limitation without ThreadManager
        thread = AssistantThread.from_dict(thread_data) if thread_data['type'] == 'assistant' else WorkerThread.from_dict(thread_data)
        thread.delete()

    return {"message": "Thread deleted"}


@router.get("/{thread_id}/messages")
async def get_messages(
    thread_id: str,
    user_id: str = Depends(get_current_user),
    limit: int = 1000,
    offset: int = 0
):
    """Get messages for a thread."""
    thread_data = db_get_thread(thread_id)
    if not thread_data:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Check access
    if thread_data['type'] != 'worker' and not can_access_thread(thread_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    messages = get_thread_messages(thread_id, limit, offset)
    return {"messages": messages}


@router.post("/{thread_id}/share")
async def share_thread(
    thread_id: str,
    data: ShareRequest,
    user_id: str = Depends(get_current_user)
):
    """Share a thread with another user."""
    thread_data = db_get_thread(thread_id)
    if not thread_data:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Only owner can share
    if thread_data['owner_id'] != user_id:
        raise HTTPException(status_code=403, detail="Only owner can share thread")

    success = db_share_thread(thread_id, data.user_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to share thread")

    return {"message": f"Thread shared with {data.user_id}"}


@router.delete("/{thread_id}/share/{share_user_id}")
async def unshare_thread(
    thread_id: str,
    share_user_id: str,
    user_id: str = Depends(get_current_user)
):
    """Remove a thread share."""
    thread_data = db_get_thread(thread_id)
    if not thread_data:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Only owner can unshare
    if thread_data['owner_id'] != user_id:
        raise HTTPException(status_code=403, detail="Only owner can unshare thread")

    success = db_unshare_thread(thread_id, share_user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Share not found")

    return {"message": f"Share removed for {share_user_id}"}


@router.get("/{thread_id}/diff")
async def get_thread_diff(
    thread_id: str,
    user_id: str = Depends(get_current_user)
):
    """Get diff stats for a worker thread."""
    thread_data = db_get_thread(thread_id)
    if not thread_data:
        raise HTTPException(status_code=404, detail="Thread not found")

    if thread_data['type'] != 'worker':
        raise HTTPException(status_code=400, detail="Only worker threads have diffs")

    if not thread_data.get('branch'):
        raise HTTPException(status_code=400, detail="Thread has no branch")

    # Need wiki access for diff
    if thread_manager is None:
        raise HTTPException(status_code=503, detail="Thread manager not initialized")

    diff_stats = git_ops.get_diff_stats(thread_manager.wiki, thread_data['branch'])
    if not diff_stats:
        return {"diff_stats": None}

    return {"diff_stats": diff_stats}


@router.post("/{thread_id}/accept")
async def accept_thread(
    thread_id: str,
    user_id: str = Depends(get_current_user)
):
    """Accept worker thread changes (merge to main)."""
    if thread_manager is None:
        raise HTTPException(status_code=503, detail="Thread manager not initialized")

    result = await thread_manager._handle_accept_thread(user_id, thread_id)

    if result.get("type") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))

    return result


@router.post("/{thread_id}/reject")
async def reject_thread(
    thread_id: str,
    user_id: str = Depends(get_current_user)
):
    """Reject worker thread changes."""
    if thread_manager is None:
        raise HTTPException(status_code=503, detail="Thread manager not initialized")

    result = await thread_manager._handle_reject_thread(user_id, thread_id)

    if result.get("type") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))

    return result


@router.get("/{thread_id}/files")
async def get_thread_files(
    thread_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Get raw file content from thread's worktree.

    Used to display merge conflict markers during resolution.
    Returns files with their raw content (including conflict markers if present).
    """
    thread_data = db_get_thread(thread_id)
    if not thread_data:
        raise HTTPException(status_code=404, detail="Thread not found")

    if thread_data['type'] != 'worker':
        raise HTTPException(status_code=400, detail="Only worker threads have worktrees")

    worktree_path = thread_data.get('worktree_path')
    if not worktree_path:
        raise HTTPException(status_code=400, detail="Thread has no worktree")

    from pathlib import Path
    import os

    worktree = Path(worktree_path)

    if not worktree.exists():
        return {"files": [], "has_conflicts": False}

    files = []
    has_conflicts = False

    for filepath in worktree.glob('**/*.md'):
        # Skip .git directory
        if '.git' in filepath.parts:
            continue
        try:
            content = filepath.read_text(encoding='utf-8')
            file_has_conflicts = '<<<<<<< ' in content or '=======' in content or '>>>>>>> ' in content
            if file_has_conflicts:
                has_conflicts = True

            rel_path = str(filepath.relative_to(worktree))
            files.append({
                "path": rel_path,
                "content": content,
                "has_conflicts": file_has_conflicts
            })
        except Exception as e:
            files.append({
                "path": str(filepath.relative_to(worktree)),
                "content": f"Error reading file: {e}",
                "has_conflicts": False,
                "error": True
            })

    return {"files": files, "has_conflicts": has_conflicts}
