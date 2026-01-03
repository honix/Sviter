from fastapi import FastAPI, WebSocket, HTTPException, BackgroundTasks, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from storage import GitWiki, PageNotFoundException, GitWikiException
from threads.manager import websocket_endpoint, initialize_thread_manager
from threads import manager as threads_module  # Access thread_manager at runtime
from threads import git_operations as git_ops
from api.threads import router as threads_router
from collab import initialize_collab_manager
from collab import manager as collab_module  # Access collab_manager at runtime
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from pathlib import Path
import uvicorn
import shutil
import mimetypes
import re
from config import WIKI_REPO_PATH, OPENROUTER_API_KEY
from db import init_db
from auth import router as auth_router

# Pydantic models for request/response
class PageCreate(BaseModel):
    title: str
    content: str = ""
    author: str = "user"
    tags: List[str] = []

class PageUpdate(BaseModel):
    content: Optional[str] = None
    author: Optional[str] = None
    tags: Optional[List[str]] = None

class FolderCreate(BaseModel):
    name: str
    parent_path: Optional[str] = None

class MoveRequest(BaseModel):
    source_path: str
    target_parent_path: Optional[str] = None
    new_order: int

class ImageUploadResponse(BaseModel):
    path: str
    url: str
    filename: str
    markdown: str

# Initialize GitWiki
wiki = GitWiki(WIKI_REPO_PATH)

# Create FastAPI app
app = FastAPI(
    title="AI Wiki Backend",
    description="Backend API for git-based AI-powered wiki system",
    version="2.0.0"
)

# Add CORS middleware for frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include auth routes
app.include_router(auth_router)

# Include threads API routes
app.include_router(threads_router)

# Startup event
@app.on_event("startup")
async def startup_event():
    """Verify wiki repository and initialize thread manager on startup"""
    try:
        # Initialize database
        init_db()
        print("✅ Database initialized")

        pages = wiki.list_pages(limit=1)
        print(f"✅ Wiki repository loaded successfully ({WIKI_REPO_PATH})")
        print(f"📚 Found {len(wiki.list_pages())} pages")

        # Initialize template files (examples for agents)
        created = wiki.ensure_templates()
        if created:
            print(f"📝 Initialized {len(created)} template files")

        # Initialize thread support (sets up .gitignore, cleans orphaned worktrees)
        git_ops.init_thread_support(wiki)
        print("🧵 Thread support initialized")

        # Initialize thread manager with wiki instance
        initialize_thread_manager(wiki, OPENROUTER_API_KEY)

        # Initialize collaborative editing manager
        collab_mgr = initialize_collab_manager(wiki)
        await collab_mgr.start()
        print("🤝 Collaborative editing manager started")

        # Connect collab manager to thread manager for merge blocking
        if threads_module.thread_manager and collab_mgr:
            threads_module.thread_manager.set_collab_manager(collab_mgr)
            print("🔗 Thread manager connected to collab manager")
    except Exception as e:
        print(f"❌ Error loading wiki repository: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up worktrees and collab manager on server shutdown"""
    try:
        # Stop collaborative editing manager
        if collab_module.collab_manager:
            await collab_module.collab_manager.stop()
            print("🤝 Collaborative editing manager stopped")

        git_ops.cleanup_orphaned_worktrees(wiki)
        print("🧹 Worktrees cleaned up")
    except Exception as e:
        print(f"⚠️ Error cleaning up: {e}")


# WebSocket endpoint for collaborative editing (MUST come before general /ws/{client_id})
@app.websocket("/ws/collab/{room_name:path}")
async def collab_websocket_handler(websocket: WebSocket, room_name: str):
    """WebSocket endpoint for collaborative editing with Yjs.

    Clients connect to a room (page path) to collaboratively edit.
    Uses pycrdt-websocket for Yjs document synchronization.
    """
    if not collab_module.collab_manager:
        await websocket.close(code=1011, reason="Collaboration manager not initialized")
        return

    # Extract client_id from query params if provided
    client_id = websocket.query_params.get("userId", "anonymous")

    await collab_module.collab_manager.connect(websocket, client_id, room_name)


# API endpoint to update editing state (for merge blocking)
@app.post("/api/collab/editing-state")
async def set_editing_state(room_name: str, client_id: str, editing: bool):
    """
    Update a client's editing state for a room.
    Only editors (not viewers) are counted for merge blocking.
    """
    if not collab_module.collab_manager:
        return {"error": "Collaboration manager not initialized"}

    await collab_module.collab_manager.set_editing_state(room_name, client_id, editing)
    return {"success": True, "room": room_name, "client_id": client_id, "editing": editing}


# API endpoint to invalidate a collab room (clear cached state)
@app.post("/api/collab/invalidate")
async def invalidate_room(room_name: str):
    """
    Invalidate a room's document state, forcing clients to reload from git.
    Used for migration or when room state is stale.
    """
    if not collab_module.collab_manager:
        return {"error": "Collaboration manager not initialized"}

    await collab_module.collab_manager.invalidate_room(room_name)
    return {"success": True, "room": room_name}


# WebSocket endpoint for chat/threads
@app.websocket("/ws/{client_id}")
async def websocket_handler(websocket: WebSocket, client_id: str):
    """Main WebSocket endpoint for chat communication"""
    await websocket_endpoint(websocket, client_id)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "ai-wiki-backend", "storage": "git"}


# Helper function for filename sanitization
def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal and invalid chars"""
    # Remove path components
    name = Path(filename).name
    # Replace dangerous characters
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '', name)
    # Collapse multiple dots/dashes
    name = re.sub(r'\.+', '.', name)
    return name or "file"


# Image upload endpoint
@app.post("/api/upload", response_model=ImageUploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    folder: str = Form(default="images"),
    author: str = Form(default="user")
):
    """Upload an image file to the wiki and commit to git"""
    # Validate file type
    allowed_types = {'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'}
    content_type = file.content_type
    if content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"File type {content_type} not allowed. Allowed types: {', '.join(allowed_types)}")

    # Sanitize filename and handle collisions
    original_filename = file.filename or "image"
    safe_filename = sanitize_filename(original_filename)

    # Create target directory if needed
    target_dir = wiki.repo_path / folder
    target_dir.mkdir(parents=True, exist_ok=True)

    # Handle filename collisions
    target_path = target_dir / safe_filename
    counter = 1
    base_name = safe_filename.rsplit('.', 1)[0] if '.' in safe_filename else safe_filename
    extension = safe_filename.rsplit('.', 1)[1] if '.' in safe_filename else ''
    while target_path.exists():
        new_name = f"{base_name}-{counter}.{extension}" if extension else f"{base_name}-{counter}"
        target_path = target_dir / new_name
        counter += 1

    # Save file
    try:
        with target_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)
    finally:
        await file.close()

    # Git add and commit
    relative_path = target_path.relative_to(wiki.repo_path)
    wiki.repo.index.add([str(relative_path)])
    wiki.repo.index.commit(
        f"Upload image: {target_path.name}",
        author=wiki._create_author(author)
    )

    # Return paths for frontend (simple relative paths, frontend converts to API URLs)
    # Use angle brackets for paths with spaces: ![alt](<path with spaces>)
    return ImageUploadResponse(
        path=str(relative_path),
        url=str(relative_path),  # Simple path like "images/foo.png"
        filename=target_path.name,
        markdown=f"![{target_path.stem}](<{relative_path}>)"
    )


# Asset serving endpoint
@app.get("/api/assets/{path:path}")
async def serve_asset(path: str):
    """Serve static assets (images) from wiki repository"""
    file_path = wiki.repo_path / path

    # Security: ensure path is within wiki repo (prevent path traversal)
    try:
        file_path.resolve().relative_to(wiki.repo_path.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Asset not found")

    # Determine content type
    content_type, _ = mimetypes.guess_type(str(file_path))

    return FileResponse(
        path=file_path,
        media_type=content_type or 'application/octet-stream',
        filename=file_path.name
    )


# API endpoints for pages
@app.get("/api/pages")
async def get_pages(limit: int = 100):
    """Get all pages"""
    try:
        pages = wiki.list_pages(limit=limit)
        return {"pages": pages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Page Tree endpoint - MUST come before {title:path} routes
@app.get("/api/pages/tree")
async def get_page_tree(ref: str = None):
    """Get hierarchical page tree with folders and ordering.

    Args:
        ref: Optional git ref (branch/commit) to get tree from. Defaults to current working tree.
    """
    try:
        if ref:
            tree = wiki.get_page_tree_at_ref(ref)
        else:
            tree = wiki.get_page_tree()
        return {"tree": tree}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# API endpoints for revisions (git history) - MUST come before general {title:path} routes
@app.get("/api/pages/{title:path}/history")
async def get_page_history(title: str, limit: int = 50):
    """Get commit history for a page"""
    try:
        history = wiki.get_page_history(title, limit)
        return {"title": title, "history": history}
    except PageNotFoundException:
        raise HTTPException(status_code=404, detail=f"Page '{title}' not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pages/{title:path}/revisions/{commit_sha}")
async def get_page_at_revision(title: str, commit_sha: str):
    """Get page content at a specific git commit"""
    try:
        page = wiki.get_page_at_revision(title, commit_sha)
        return page
    except GitWikiException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pages/{title:path}/at-ref")
async def get_page_at_ref(title: str, ref: str = "main"):
    """Get page content at specific git ref (branch/commit/tag)"""
    try:
        content = wiki.get_page_content_at_ref(title, ref)
        return {"content": content, "exists": bool(content)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pages/{title:path}")
async def get_page(title: str):
    """Get a specific page by title"""
    try:
        page = wiki.get_page(title)
        return page
    except PageNotFoundException:
        raise HTTPException(status_code=404, detail=f"Page '{title}' not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pages")
async def create_page(page_data: PageCreate):
    """Create a new page"""
    try:
        new_page = wiki.create_page(
            title=page_data.title,
            content=page_data.content,
            author=page_data.author,
            tags=page_data.tags
        )
        return new_page
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/pages/{title:path}")
async def update_page(title: str, page_data: PageUpdate):
    """Update an existing page"""
    try:
        updated_page = wiki.update_page(
            title=title,
            content=page_data.content if page_data.content is not None else wiki.get_page(title)["content"],
            author=page_data.author or "user",
            tags=page_data.tags
        )
        return updated_page
    except PageNotFoundException:
        raise HTTPException(status_code=404, detail=f"Page '{title}' not found")
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/pages/{title:path}")
async def delete_page(title: str, author: str = "user"):
    """Delete a page"""
    try:
        wiki.delete_page(title, author)
        return {"message": f"Page '{title}' deleted successfully"}
    except PageNotFoundException:
        raise HTTPException(status_code=404, detail=f"Page '{title}' not found")
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PageRename(BaseModel):
    new_name: str
    author: str = "user"


@app.post("/api/pages/{title:path}/rename")
async def rename_page(title: str, data: PageRename):
    """Rename a page (change filename, keep in same folder)"""
    try:
        renamed_page = wiki.rename_page(
            old_path=title,
            new_name=data.new_name,
            author=data.author
        )
        return renamed_page
    except PageNotFoundException:
        raise HTTPException(status_code=404, detail=f"Page '{title}' not found")
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Folder API endpoints
@app.post("/api/pages/move")
async def move_page_item(request: MoveRequest):
    """Move a page or folder to a new location with specified order"""
    try:
        result = wiki.move_item(
            source_path=request.source_path,
            target_parent=request.target_parent_path,
            new_order=request.new_order,
            author="user"
        )
        return result
    except PageNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/folders")
async def create_folder(request: FolderCreate):
    """Create a new folder"""
    try:
        folder = wiki.create_folder(
            name=request.name,
            parent_path=request.parent_path,
            author="user"
        )
        return folder
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/folders/{path:path}")
async def delete_folder(path: str):
    """Delete an empty folder"""
    try:
        wiki.delete_folder(path, author="user")
        return {"message": f"Folder '{path}' deleted successfully"}
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Git Branch API endpoints
@app.get("/api/git/branches")
async def get_branches():
    """Get list of all git branches"""
    try:
        branches = wiki.list_branches()
        return {"branches": branches}
    except GitWikiException as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/git/current-branch")
async def get_current_branch():
    """Get currently active git branch"""
    try:
        current = wiki.get_current_branch()
        return {"branch": current}
    except GitWikiException as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/git/checkout")
async def checkout_branch(data: dict):
    """Switch to a different branch"""
    try:
        branch_name = data.get("branch")
        if not branch_name:
            raise HTTPException(status_code=400, detail="Branch name is required")

        wiki.checkout_branch(branch_name)
        return {"message": f"Switched to branch '{branch_name}'", "branch": branch_name}
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/git/create-branch")
async def create_branch(data: dict):
    """Create a new branch"""
    try:
        branch_name = data.get("name")
        from_branch = data.get("from", "main")

        if not branch_name:
            raise HTTPException(status_code=400, detail="Branch name is required")

        created_branch = wiki.create_branch(branch_name, from_branch)
        return {"message": f"Created and switched to branch '{created_branch}'", "branch": created_branch}
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/git/branches/{branch_name:path}")
async def delete_branch(branch_name: str, force: bool = False):
    """Delete a git branch"""
    try:
        current_branch = wiki.get_current_branch()
        if branch_name == current_branch:
            raise HTTPException(status_code=400, detail="Cannot delete the currently checked out branch")

        if branch_name == "main":
            raise HTTPException(status_code=400, detail="Cannot delete the main branch")

        success = wiki.delete_branch(branch_name, force=force)
        if success:
            return {"message": f"Branch '{branch_name}' deleted successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete branch")
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/git/diff")
async def get_branch_diff(branch1: str, branch2: str):
    """Get unified diff between two branches"""
    try:
        diff = wiki.get_diff(branch1, branch2)
        return {"branch1": branch1, "branch2": branch2, "diff": diff}
    except GitWikiException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/git/diff-stats")
async def get_branch_diff_stats(branch1: str, branch2: str):
    """Get diff statistics between two branches"""
    try:
        stats = wiki.get_diff_stat(branch1, branch2)
        return {"branch1": branch1, "branch2": branch2, "stats": stats}
    except GitWikiException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/git/diff-stats-by-page")
async def get_diff_stats_by_page(base: str = "main", head: str = None):
    """Get per-page diff stats between branches. If head is not provided, uses current branch."""
    try:
        current = head if head else wiki.get_current_branch()
        if current == base:
            return {"stats": {}}
        stats = wiki.get_diff_stats_by_page(base, current)
        return {"stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/git/merge")
async def merge_branches(data: dict):
    """Merge source branch into target branch"""
    try:
        source_branch = data.get("source_branch")
        target_branch = data.get("target_branch")

        if not source_branch or not target_branch:
            raise HTTPException(status_code=400, detail="source_branch and target_branch are required")

        wiki.merge_branch(
            source_branch=source_branch,
            target_branch=target_branch,
            author="Human Reviewer",
            no_ff=True
        )
        return {"message": f"Merged '{source_branch}' into '{target_branch}'"}
    except GitWikiException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




# Root endpoint with API info
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "AI Wiki Backend API (Git-based)",
        "version": "2.0.0",
        "storage": "git",
        "websocket_endpoint": "/ws/{client_id}",
        "api_endpoints": {
            "pages": "/api/pages",
            "single_page": "/api/pages/{title}",
            "page_history": "/api/pages/{title}/history",
            "page_revision": "/api/pages/{title}/revisions/{commit_sha}",
            "git_branches": "/api/git/branches",
            "git_current_branch": "/api/git/current-branch",
            "git_checkout": "POST /api/git/checkout",
            "git_create_branch": "POST /api/git/create-branch"
        },
        "documentation": "/docs"
    }

if __name__ == "__main__":
    # Run the server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
