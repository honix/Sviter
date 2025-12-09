from fastapi import FastAPI, WebSocket, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from storage import GitWiki, PageNotFoundException, GitWikiException
from api.session_manager import websocket_endpoint, initialize_session_manager
from threads import git_operations as git_ops
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
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

# Startup event
@app.on_event("startup")
async def startup_event():
    """Verify wiki repository and initialize chat manager on startup"""
    try:
        # Initialize database
        init_db()
        print("✅ Database initialized")

        pages = wiki.list_pages(limit=1)
        print(f"✅ Wiki repository loaded successfully ({WIKI_REPO_PATH})")
        print(f"📚 Found {len(wiki.list_pages())} pages")

        # Clean up any orphaned worktrees from previous sessions
        git_ops.cleanup_orphaned_worktrees(wiki)
        print("🧹 Cleaned up orphaned worktrees")

        # Initialize session manager with wiki instance
        initialize_session_manager(wiki, OPENROUTER_API_KEY)
    except Exception as e:
        print(f"❌ Error loading wiki repository: {e}")

# WebSocket endpoint
@app.websocket("/ws/{client_id}")
async def websocket_handler(websocket: WebSocket, client_id: str):
    """Main WebSocket endpoint for chat communication"""
    await websocket_endpoint(websocket, client_id)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "ai-wiki-backend", "storage": "git"}

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
async def get_page_tree():
    """Get hierarchical page tree with folders and ordering"""
    try:
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
