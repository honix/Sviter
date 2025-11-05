from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from storage import GitWiki, PageNotFoundException, GitWikiException
from api.websocket import websocket_endpoint
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn
from pathlib import Path

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

# API endpoints for revisions (git history)
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
            "page_revision": "/api/pages/{title}/revisions/{commit_sha}"
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
