# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered wiki system with a FastAPI backend and React frontend. The system combines traditional wiki functionality with AI agents for intelligent content management through chat interface.

## Architecture

### Backend (Python FastAPI)
- **Framework**: FastAPI with WebSocket support for real-time communication
- **Database**: SQLite with SQLAlchemy ORM for page persistence
- **AI Integration**: OpenRouter API with wiki-specific tools (read/edit/find pages)
- **Real-time**: WebSocket endpoints for chat and live updates
- **Virtual Environment**: Uses `venv` for dependency isolation

### Frontend (React TypeScript)
- **Framework**: React 19 with TypeScript and Vite
- **Styling**: TailwindCSS for responsive design
- **Layout**: 3-panel design (page tree, content editor, AI chat)
- **Real-time**: WebSocket client for live communication
- **State Management**: React Context API with useReducer

## Running the Application

### Backend
```bash
cd backend
source venv/bin/activate  # Activate virtual environment
python main.py           # Start FastAPI server on port 8000
```

### Frontend
```bash
cd frontend
npm install              # Install dependencies (first time only)
npm run dev             # Start Vite dev server on port 5173
```

## Project Structure

```
├── CLAUDE.md                 # This file - project instructions
├── MVP.md                    # Project requirements and architecture
├── openrouter_test.py        # Original prototype (reference)
├── backend/                  # Python FastAPI backend
│   ├── venv/                 # Virtual environment (IMPORTANT: use this)
│   ├── main.py               # FastAPI app entry point
│   ├── requirements.txt      # Python dependencies
│   ├── wiki_ai.db           # SQLite database
│   ├── database/            # Database models and operations
│   ├── ai/                  # AI integration (OpenRouter + tools)
│   ├── api/                 # WebSocket handlers
│   └── tests/               # Backend tests
└── frontend/                # React TypeScript frontend
    ├── src/
    │   ├── components/      # React components (layout, chat, pages)
    │   ├── hooks/           # Custom React hooks
    │   ├── contexts/        # Global state management
    │   ├── services/        # WebSocket and API services
    │   ├── types/           # TypeScript type definitions
    │   └── utils/           # Utility functions
    ├── package.json         # Node.js dependencies
    └── vite.config.ts       # Vite configuration
```

## Key Implementation Details

### Backend
- **Virtual Environment**: ALWAYS use `source venv/bin/activate` before running Python commands
- **Database**: SQLite with pages table for wiki content and metadata
- **WebSocket**: Real-time communication on `/ws/{client_id}` endpoint
- **AI Tools**: Custom functions for page management (read_page, edit_page, find_pages)
- **CORS**: Configured for frontend connections

### Frontend
- **WebSocket Integration**: Automatic connection and reconnection to backend
- **Page Management**: Create, edit, view, delete pages with real-time sync
- **Markdown Support**: Simple markdown parser for content rendering
- **Error Handling**: Error boundaries and loading states
- **Keyboard Shortcuts**: Ctrl+E (toggle edit), Escape (exit edit)

## Dependencies

### Backend (in venv)
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `websockets` - WebSocket support
- `sqlalchemy` - Database ORM
- `openai` - AI integration
- `pytest` - Testing framework

### Frontend
- `react` - UI framework
- `typescript` - Type safety
- `vite` - Build tool
- `tailwindcss` - Styling
- `@types/*` - TypeScript definitions

## Development Workflow

1. **Backend Development**: Always activate venv first with `source venv/bin/activate`
2. **Frontend Development**: Standard npm workflow in frontend directory
3. **Testing**: Run backend tests with `python run_tests.py` (in venv)
4. **WebSocket Testing**: Use `python chat_client.py` for backend testing (in venv)
5. **Agentic Testing**: Use Playwright MCP to test the full application autonomously - tests UI navigation, page creation/editing, WebSocket chat, and real-time synchronization

## Security Notes

- API keys should be moved to environment variables for production
- WebSocket connections validated per client
- SQL injection prevented via SQLAlchemy ORM
- Input sanitization for markdown content

## Important Notes

- **Virtual Environment**: The backend MUST be run with the virtual environment activated
- **Port Configuration**: Backend on 8000, Frontend on 5173
- **WebSocket URL**: Frontend connects to `ws://localhost:8000/ws/`
- **Database**: SQLite file created automatically on first run
- **Real-time Features**: Full bidirectional communication between frontend and backend