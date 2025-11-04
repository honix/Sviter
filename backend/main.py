from fastapi import FastAPI, WebSocket, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from database.database import create_tables, get_db_session
from database.crud import PageCRUD, RevisionCRUD
from api.websocket import websocket_endpoint
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uvicorn

# Pydantic models for request/response
class PageCreate(BaseModel):
    title: str
    content: str = ""
    content_json: Optional[Dict[str, Any]] = None
    author: str = "user"
    tags: List[str] = []

class PageUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    content_json: Optional[Dict[str, Any]] = None
    author: Optional[str] = None
    tags: Optional[List[str]] = None

class RevisionCreate(BaseModel):
    content: str
    content_json: Optional[Dict[str, Any]] = None
    author: str = "user"
    comment: Optional[str] = None

# Create FastAPI app
app = FastAPI(
    title="AI Wiki Backend",
    description="Backend API for AI-powered wiki system",
    version="1.0.0"
)

# Add CORS middleware for frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database tables on startup
@app.on_event("startup")
async def startup_event():
    """Initialize database tables"""
    try:
        create_tables()
        print("✅ Database tables initialized successfully")
    except Exception as e:
        print(f"❌ Error initializing database: {e}")

# WebSocket endpoint
@app.websocket("/ws/{client_id}")
async def websocket_handler(websocket: WebSocket, client_id: str):
    """Main WebSocket endpoint for chat communication"""
    await websocket_endpoint(websocket, client_id)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "ai-wiki-backend"}

# API endpoints for pages
@app.get("/api/pages")
async def get_pages(db: Session = Depends(get_db_session)):
    """Get all pages"""
    try:
        pages = PageCRUD.get_all_pages(db)
        return {"pages": [page.to_dict() for page in pages]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pages/{page_id}")
async def get_page(page_id: int, db: Session = Depends(get_db_session)):
    """Get a specific page by ID"""
    try:
        page = PageCRUD.get_page_by_id(db, page_id)
        if not page:
            raise HTTPException(status_code=404, detail="Page not found")
        return page.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pages")
async def create_page(page_data: PageCreate, db: Session = Depends(get_db_session)):
    """Create a new page"""
    try:
        new_page = PageCRUD.create_page(
            db=db,
            title=page_data.title,
            content=page_data.content,
            content_json=page_data.content_json,
            author=page_data.author,
            tags=page_data.tags
        )

        # Create initial revision
        RevisionCRUD.create_revision(
            db=db,
            page_id=new_page.id,
            content=new_page.content,
            content_json=new_page.content_json,
            author=new_page.author,
            comment="Initial version"
        )

        return new_page.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/pages/{page_id}")
async def update_page(page_id: int, page_data: PageUpdate, db: Session = Depends(get_db_session)):
    """Update an existing page and create a revision"""
    try:
        updated_page = PageCRUD.update_page(
            db=db,
            page_id=page_id,
            title=page_data.title,
            content=page_data.content,
            content_json=page_data.content_json,
            author=page_data.author,
            tags=page_data.tags
        )

        if not updated_page:
            raise HTTPException(status_code=404, detail="Page not found")

        # Create a revision after update (only if content changed)
        if page_data.content is not None or page_data.content_json is not None:
            RevisionCRUD.create_revision(
                db=db,
                page_id=updated_page.id,
                content=updated_page.content,
                content_json=updated_page.content_json,
                author=page_data.author or updated_page.author,
                comment=None
            )

        return updated_page.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# API endpoints for revisions
@app.get("/api/pages/{page_id}/revisions")
async def get_revisions(page_id: int, limit: int = 50, db: Session = Depends(get_db_session)):
    """Get all revisions for a page"""
    try:
        # Check if page exists
        page = PageCRUD.get_page_by_id(db, page_id)
        if not page:
            raise HTTPException(status_code=404, detail="Page not found")

        revisions = RevisionCRUD.get_revisions_by_page(db, page_id, limit)
        return {"revisions": [revision.to_dict() for revision in revisions]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/pages/{page_id}/revisions/{revision_id}")
async def get_revision(page_id: int, revision_id: int, db: Session = Depends(get_db_session)):
    """Get a specific revision"""
    try:
        # Check if page exists
        page = PageCRUD.get_page_by_id(db, page_id)
        if not page:
            raise HTTPException(status_code=404, detail="Page not found")

        revision = RevisionCRUD.get_revision(db, revision_id)
        if not revision or revision.page_id != page_id:
            raise HTTPException(status_code=404, detail="Revision not found")

        return revision.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/pages/{page_id}/revisions")
async def create_revision(page_id: int, revision_data: RevisionCreate, db: Session = Depends(get_db_session)):
    """Manually create a revision for a page"""
    try:
        # Check if page exists
        page = PageCRUD.get_page_by_id(db, page_id)
        if not page:
            raise HTTPException(status_code=404, detail="Page not found")

        new_revision = RevisionCRUD.create_revision(
            db=db,
            page_id=page_id,
            content=revision_data.content,
            content_json=revision_data.content_json,
            author=revision_data.author,
            comment=revision_data.comment
        )

        return new_revision.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/pages/{page_id}")
async def delete_page(page_id: int, db: Session = Depends(get_db_session)):
    """Delete a page"""
    try:
        success = PageCRUD.delete_page(db=db, page_id=page_id)
        if not success:
            raise HTTPException(status_code=404, detail="Page not found")

        return {"message": "Page deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Root endpoint with API info
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "AI Wiki Backend API",
        "version": "1.0.0",
        "websocket_endpoint": "/ws/{client_id}",
        "api_endpoints": {
            "pages": "/api/pages",
            "single_page": "/api/pages/{page_id}"
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