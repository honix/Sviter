# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered wiki system with a FastAPI backend and React frontend. The system combines traditional wiki functionality with:

- **AI Chat Assistant**: Real-time AI assistance via WebSocket for wiki content
- **Autonomous Threads**: Background workers that can read/edit pages on their own git branches
- **Git-Native Workflow**: All changes tracked in git, threads work on branches (`thread/<name>/<timestamp>`)

## Architecture

### Backend (Python FastAPI)

- **Framework**: FastAPI with WebSocket support for real-time communication
- **Storage**: Git-based wiki storage with GitWiki class (no database needed)
- **AI Integration**: OpenRouter API with wiki-specific tools (read/edit/find/list pages)
- **Real-time**: WebSocket endpoints for chat and live updates
- **Session Management**: Unified SessionManager handles main chat + worker threads
- **Thread System**: Autonomous workers on git branches (`thread/<name>/<timestamp>`)
- **Tool System**: Composable tools via ToolBuilder (read/edit/spawn/review)
### Frontend (React TypeScript)

- **Framework**: React 19 with TypeScript and Vite
- **Styling**: TailwindCSS v3.4.0 + Shadcn UI components (uses CSS variables in HSL format)
- **UI Components**: Shadcn UI with Prompt Kit for chat interface
- **Layout**: 3-panel resizable design (left: page tree, center: content/thread review, right: chat/threads)
  - No routing - uses context-based state management for panel modes
  - Right panel: Tabs for Chat/Threads switcher
  - Center panel: Dynamic page view or thread changes review mode
- **Real-time**: WebSocket client for live communication
- **State Management**: React Context API with useReducer
  - `rightPanelMode`: 'chat' | 'threads'
  - `centerPanelMode`: 'page' | 'thread-review'
  - `selectedThread`: Current thread being reviewed
- **Git Integration**: Branch selector, branch creation/deletion
- **Custom Scrollbars**: `.custom-scrollbar` and `.chat-scrollbar` classes for consistent styling

## Running the Application

```bash
make setup    # Create venv + install all dependencies (first time only)
make run      # Start both backend and frontend
```

Other commands:
- `make backend` - Start backend only (port 8000)
- `make frontend` - Start frontend only (port 5173)
- `make clean` - Remove venv and node_modules

## Project Structure

```
├── CLAUDE.md                 # This file - project instructions
├── Makefile                  # Build commands (setup, run, clean)
├── backend/                  # Python FastAPI backend
│   ├── main.py               # FastAPI app entry point
│   ├── requirements.txt      # Python dependencies
│   ├── storage/             # Git-based wiki storage (GitWiki)
│   ├── ai/                  # AI integration
│   │   ├── prompts.py       # System prompts (ASSISTANT_PROMPT, THREAD_PROMPT)
│   │   ├── tools.py         # WikiTool + ToolBuilder (composable tool sets)
│   │   └── adapters/        # LLM adapters (Claude SDK, OpenRouter)
│   ├── threads/             # Thread system (autonomous workers)
│   │   ├── thread.py        # Thread, ThreadStatus, ThreadMessage
│   │   ├── accept_result.py # AcceptResult enum
│   │   └── git_operations.py # Git branch helpers
│   ├── agents/              # Agent execution
│   │   └── executor.py      # AgentExecutor (LLM conversation loop)
│   ├── api/                 # API layer
│   │   └── session_manager.py # SessionManager (WebSocket + sessions)
│   ├── scripts/             # Utility scripts
│   └── tests/               # Backend tests
└── frontend/                # React TypeScript frontend
    ├── src/
    │   ├── components/
    │   │   ├── layout/      # MainLayout, LeftPanel, CenterPanel, RightPanel
    │   │   ├── chat/        # ChatInterface with StickToBottom scrolling
    │   │   ├── pages/       # PageTree, PageItem
    │   │   ├── git/         # BranchSwitcher with tags/delete
    │   │   ├── agents/      # AgentPanel, PRReviewPanel, DiffViewer
    │   │   └── ui/          # Shadcn UI components
    │   ├── hooks/           # Custom React hooks
    │   ├── contexts/        # AppContext with agent/PR state
    │   ├── services/        # WebSocket, agents-api
    │   ├── types/           # TypeScript type definitions (Agent, PullRequest, etc.)
    │   └── utils/           # Utility functions
    ├── package.json         # Node.js dependencies
    └── vite.config.ts       # Vite configuration
```

## Key Implementation Details

### Backend

- **Storage**: Git-based with GitWiki class - all content in `etoneto-wiki/` git submodule
- **WebSocket**: Real-time communication on `/ws/{client_id}` endpoint via SessionManager
- **Session Types**:
  - **Main session**: Read-only assistant with spawn_thread/list_threads tools
  - **Thread session**: Autonomous worker with read/edit/request_help/mark_for_review tools
- **Thread Workflow**:
  - Main chat spawns threads via `spawn_thread(name, goal)`
  - Threads work on branches: `thread/<name>/<timestamp>`
  - Status flow: WORKING → NEED_HELP or REVIEW
  - Accept merges to main, Reject deletes branch
- **Git APIs**: `/api/git/branches`, `/api/git/checkout`, `/api/git/diff`, etc.
- **CORS**: Configured for frontend connections

### Frontend

- **No Routing**: Context-based state management, no react-router-dom
- **Panel Modes**:
  - Right panel: Chat/Threads tabs (`rightPanelMode`)
  - Center panel: Page view or thread review (`centerPanelMode`)
- **WebSocket Integration**: Automatic connection and reconnection to backend
- **Page Management**: Create, edit, view, delete pages with real-time sync
- **Git Integration**:
  - Branch selector with branch creation/deletion
  - Checkout branches with page reload
- **Thread Management**:
  - View active threads in right panel
  - Threads show status: WORKING, NEED_HELP, REVIEW
  - Click thread to view changes in center panel
  - Accept (merges to main) or Reject (deletes branch)
- **Markdown Support**: Simple markdown parser for content rendering
- **Error Handling**: Error boundaries and loading states
- **Keyboard Shortcuts**: Ctrl+E (toggle edit), Escape (exit edit)
- **Shadcn Components**:
  - MUST use Tailwind CSS v3.4.0 (NOT v4) - v4 is incompatible
  - Components copied to `src/components/ui/` (not npm packages)
  - Styling uses CSS variables in `src/index.css` (format: `--primary: 222.2 47.4% 11.2%`)
  - Custom scrollbars defined in `src/index.css` with `.custom-scrollbar` and `.chat-scrollbar`
- **Chat Interface**:
  - Uses Prompt Kit components (Message, PromptInput, etc.)
  - Auto-scroll enabled via ChatContainer's StickToBottom component
  - Proper flex layout with `min-h-0` for scrolling
  - User messages: right-aligned with `bg-primary` styling
  - AI responses: left-aligned, markdown rendered

## Dependencies

### Backend

- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `websockets` - WebSocket support
- `anthropic` - Claude SDK for AI integration
- `gitpython` - Git operations
- `pytest` - Testing framework

### Frontend

- `react` v19 - UI framework
- `typescript` - Type safety
- `vite` - Build tool
- `tailwindcss` v3.4.0 - Styling (CRITICAL: must be v3, NOT v4)
- `@radix-ui/*` - Primitives for Shadcn components
- `use-stick-to-bottom` - Auto-scroll for chat
- `lucide-react` - Icons
- `@types/*` - TypeScript definitions

## Development Workflow

1. **First time setup**: `make setup`
2. **Run both servers**: `make run`
3. **Testing**: Run backend tests with `backend/venv/bin/python scripts/run_tests.py`
4. **WebSocket Testing**: Use `backend/venv/bin/python scripts/chat_client.py` for backend testing
5. **Agentic Testing**: Use Playwright MCP to test the full application autonomously

## Security Notes

- API keys should be moved to environment variables for production
- WebSocket connections validated per client
- Git operations validated (branch names sanitized)
- Input sanitization for markdown content

## Important Notes

- **Port Configuration**: Backend on 8000, Frontend on 5173
- **WebSocket URL**: Frontend connects to `ws://localhost:8000/ws/`
- **Git Repository**: Wiki content stored in `etoneto-wiki/` submodule (https://github.com/honix/etoneto-wiki)
- **No Routing**: Application uses context-based state, NOT react-router-dom
- **Flexbox Scrolling**: Use `min-h-0` on flex children to enable proper scrolling
- **Real-time Features**: Full bidirectional communication between frontend and backend

## Claude Code Web Workflow

When running in **Claude Code on the web** (not CLI):

- **DO NOT push directly to `main`** — use session branch only
- Push all changes to the assigned session branch (e.g., `claude/feature-name-<session-id>`)
- Create a PR for merging to main instead of direct push
- The wiki submodule (`etoneto-wiki/`) can be pushed to main directly since it's a separate repo

## Real-time Thread Updates

### Branch & Page Lifecycle
- **Branch creation**: Thread branches created when spawned via `spawn_thread`
- **Live page updates**: Pages appear in tree as threads edit them (via `page_updated` WebSocket messages)
- **Branch cleanup**: Rejected branches deleted, accepted branches merged to main

### WebSocket Message Types
- `thread_created` / `thread_updated` - Thread lifecycle and status changes
- `page_updated` - Real-time page tree updates during thread execution
- `assistant_message` / `tool_call` / `tool_result` - Streaming conversation

### Implementation Notes
- React 18 batching workaround: Use refs (`reloadFunctionsRef` in AppContext) to call reload functions from WebSocket callbacks with empty deps
- System prompt bubble: Full width styling in ChatInterface
