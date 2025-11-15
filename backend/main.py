from fastapi import FastAPI, WebSocket, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from storage import GitWiki, PageNotFoundException, GitWikiException
from api.websocket import websocket_endpoint
from agents import (
    AgentExecutor, get_agent_by_name,
    list_available_agents
)
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
from pathlib import Path
import os

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

# Initialize GitWiki
WIKI_REPO_PATH = str(Path(__file__).parent.parent / "wiki-repo")
wiki = GitWiki(WIKI_REPO_PATH)

# Initialize Agent System
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "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")
agent_executor = AgentExecutor(wiki, OPENROUTER_API_KEY)

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

# Startup event
@app.on_event("startup")
async def startup_event():
    """Verify wiki repository on startup"""
    try:
        pages = wiki.list_pages(limit=1)
        print(f"✅ Wiki repository loaded successfully ({WIKI_REPO_PATH})")
        print(f"📚 Found {len(wiki.list_pages())} pages")
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


# Agent Management API endpoints
@app.get("/api/agents")
async def get_agents():
    """Get list of all available agents"""
    try:
        agents = list_available_agents()
        return {"agents": agents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/agents/{agent_name}/run")
async def run_agent(agent_name: str, background_tasks: BackgroundTasks):
    """Manually trigger an agent execution"""
    try:
        # Get agent class
        agent_class = get_agent_by_name(agent_name)

        # Execute agent in background
        result = agent_executor.execute(agent_class)

        return {
            "message": f"Agent '{agent_name}' executed",
            "result": result.to_dict()
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
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
            "git_create_branch": "POST /api/git/create-branch",
            "agents": "/api/agents",
            "run_agent": "POST /api/agents/{agent_name}/run",
            "pending_prs": "/api/prs/pending",
            "recent_prs": "/api/prs/recent",
            "pr_diff": "/api/prs/{branch}/diff",
            "pr_stats": "/api/prs/{branch}/stats",
            "approve_pr": "POST /api/prs/{branch}/approve",
            "reject_pr": "POST /api/prs/{branch}/reject"
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
