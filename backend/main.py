from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from database.database import create_tables
from api.websocket import websocket_endpoint
import uvicorn

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

# Root endpoint with API info
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "AI Wiki Backend API",
        "version": "1.0.0",
        "websocket_endpoint": "/ws/{client_id}",
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