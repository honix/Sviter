# AI-Powered Wiki MVP

## Project Overview

An AI-powered wiki system that combines traditional wiki functionality with AI agents for intelligent content management. The system allows users to interact with wiki pages through both direct editing and AI-assisted chat interface.

## Current State ✅ COMPLETED

- **Backend**: FastAPI server with WebSocket support running on `http://localhost:8000`
- **Database**: SQLite database with pages table for wiki content
- **AI Integration**: OpenRouter API with wiki-specific tools working
- **Chat Client**: Working WebSocket client for real-time AI chat
- **Testing**: Comprehensive unit tests and agentic testing implemented

## Target Architecture

### Backend (Python) ✅ COMPLETED
- **Framework**: FastAPI with WebSocket support ✅
- **Database**: SQLite for page persistence and metadata ✅  
- **AI Integration**: OpenRouter API with wiki tools ✅
- **Real-time**: WebSocket for chat and live updates ✅

### Frontend (React)
- **Layout**: Classic 3-panel design:
  - Left: Page tree/explorer
  - Center: Page content with tabs (edit/view modes) 
  - Right: AI chat interface
- **Editor**: ProseMirror for markdown editing
- **Real-time**: WebSocket client for live updates

### Project Structure
```
├── MVP.md                    # This document  
├── CLAUDE.md                 # Project instructions for AI agents
├── openrouter_test.py        # Original implementation (reference)
├── backend/                  # ✅ COMPLETED - Python FastAPI backend
│   ├── main.py               # FastAPI app + WebSocket endpoints
│   ├── requirements.txt      # Python dependencies
│   ├── chat_client.py        # Working WebSocket chat client
│   ├── quick_test.py         # Demo script for testing functionality
│   ├── run_tests.py          # Test runner script
│   ├── wiki_ai.db            # SQLite database file
│   ├── database/
│   │   ├── models.py         # SQLAlchemy models
│   │   ├── database.py       # DB connection setup
│   │   └── crud.py           # Database operations
│   ├── ai/
│   │   ├── client.py         # OpenRouter API client
│   │   ├── tools.py          # Wiki AI tools (read/edit/find pages)
│   │   └── chat.py           # Chat logic with tool calling
│   ├── api/
│   │   └── websocket.py      # WebSocket handlers
│   └── tests/
│       ├── test_database.py  # Database CRUD tests
│       ├── test_tools.py     # AI tools tests
│       ├── test_websocket.py # WebSocket tests
│       └── agentic_test.py   # End-to-end AI agent tests
├── frontend/                 # TODO - React web application
│   └── (to be implemented)
└── README.md                 # TODO - Setup and running instructions
```

## MVP Scope & Features

### Core Features (MVP)
- **Page Management**: Create, read, update, delete wiki pages
- **AI Chat Interface**: Real-time chat with AI agents
- **AI Tools**: 
  - `read_page(title)` - Read wiki page content
  - `edit_page(title, content)` - Update page content
  - `find_pages(query)` - Search pages by content/title
- **Real-time Updates**: WebSocket-based communication
- **Page Metadata**: Title, content, created/modified timestamps, tags

### Future Features (Post-MVP)
- **Multi-user Support**: Authentication and user management
- **Collaboration**: Real-time collaborative editing
- **Version History**: Page revision tracking
- **Advanced Search**: Full-text search with indexing
- **File Attachments**: Images and documents
- **Access Control**: Page permissions and roles

## Technical Decisions

### Database Schema (MVP)
```sql
CREATE TABLE pages (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) UNIQUE NOT NULL,
    content TEXT DEFAULT '',
    author VARCHAR(255) DEFAULT 'anonymous',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tags TEXT[] DEFAULT '{}'
);
```

### API Design
- **WebSocket Endpoint**: `/ws` for real-time chat and updates
- **REST Endpoints** (if needed): `/api/pages/*` for initial data loading
- **Message Format**: JSON with `type`, `data`, and optional `page_id` fields

### AI Integration
- **Model Configuration**: Multiple OpenRouter models supported (currently using `openai/gpt-oss-20b`)
- **Tool Calling**: Function-based tools for wiki operations
- **Context Management**: Conversation history maintained per WebSocket session

## Development Approach

### Phase 1: Backend Foundation
1. Set up FastAPI with WebSocket support
2. Implement PostgreSQL database with basic CRUD operations
3. Refactor current chat logic into WebSocket handlers
4. Create wiki-specific AI tools
5. Test backend with WebSocket clients

### Phase 2: Frontend Development
1. Create React app with 3-panel layout
2. Implement ProseMirror markdown editor
3. Add WebSocket client for real-time communication
4. Integrate page tree navigation

### Phase 3: Integration & Polish
1. Connect frontend to backend WebSocket API
2. Test real-time updates and AI interactions
3. Performance optimization
4. Error handling and user feedback

## Development Requirements

### AI-Agent Friendly Development
- Clear file separation and modular architecture
- Comprehensive type hints and documentation
- Easy testing via WebSocket clients or MCP tools
- Minimal setup complexity for new development sessions

### Key Dependencies
- **Backend**: fastapi, websockets, sqlalchemy, psycopg2, openai
- **Frontend**: react, prosemirror, websocket client libraries
- **Database**: PostgreSQL

### Security Considerations
- Environment variables for API keys (move from hardcoded)
- SQL injection prevention via SQLAlchemy ORM
- WebSocket connection validation
- Input sanitization for markdown content

## Testing Strategy

### Backend Testing
- WebSocket client tests for chat functionality
- Database operations testing
- AI tool functionality verification
- API endpoint testing

### Frontend Testing  
- Component testing for UI elements
- WebSocket integration testing
- User interaction flow testing

## Success Metrics

### MVP Goals
- [ ] AI agent can successfully read/edit/find wiki pages
- [ ] Real-time chat interface works smoothly
- [ ] Pages persist correctly in database
- [ ] Basic 3-panel UI functional
- [ ] WebSocket communication stable

### Performance Targets
- WebSocket message latency < 100ms
- Page load time < 2 seconds
- Support for 100+ pages without performance degradation
- AI response time < 5 seconds for simple operations

## Notes

- Development prioritizes AI-agent compatibility (Claude Code/MCP)
- Architecture designed for future multi-user expansion
- Focus on core wiki + AI functionality for MVP
- Web-first approach (not Electron) for better browser tooling integration