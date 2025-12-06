# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered wiki system with a FastAPI backend and React frontend. The system combines traditional wiki functionality with:

- **AI Chat Assistant**: Real-time AI assistance via WebSocket for wiki content
- **Autonomous Agents**: Background agents that can read/edit pages and create PRs for review
- **Git-Native Workflow**: All changes tracked in git with branch-based PR system

## Architecture

### Backend (Python FastAPI)

- **Framework**: FastAPI with WebSocket support for real-time communication
- **Storage**: Git-based wiki storage with GitWiki class (no database needed)
- **AI Integration**: OpenRouter API with wiki-specific tools (read/edit/find/list pages)
- **Real-time**: WebSocket endpoints for chat and live updates
- **Agent System**: Autonomous agents with loop control, PR creation, and git-native workflow
  - Agents module with BaseAgent, executor, loop_controller, pr_manager
  - Git-native PRs using branches (`agent/<name>/<timestamp>`)
  - 5-layer loop control to prevent runaway agents
### Frontend (React TypeScript)

- **Framework**: React 19 with TypeScript and Vite
- **Styling**: TailwindCSS v3.4.0 + Shadcn UI components (uses CSS variables in HSL format)
- **UI Components**: Shadcn UI with Prompt Kit for chat interface
- **Layout**: 3-panel resizable design (left: page tree, center: content/PR review, right: chat/agents)
  - No routing - uses context-based state management for panel modes
  - Right panel: Tabs for Chat/Agents switcher
  - Center panel: Dynamic page view or PR review mode
- **Real-time**: WebSocket client for live communication
- **State Management**: React Context API with useReducer
  - `rightPanelMode`: 'chat' | 'agents'
  - `centerPanelMode`: 'page' | 'pr-review'
  - `selectedPRBranch`: Current PR being reviewed
- **Git Integration**: Branch selector, branch creation/deletion
- **Custom Scrollbars**: `.custom-scrollbar` and `.chat-scrollbar` classes for consistent styling

## Running the Application

### Backend

```bash
cd backend
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
├── backend/                  # Python FastAPI backend
│   ├── main.py               # FastAPI app entry point
│   ├── requirements.txt      # Python dependencies
│   ├── storage/             # Git-based wiki storage (GitWiki)
│   ├── ai/                  # AI integration (OpenRouter + tools)
│   ├── agents/              # Autonomous agent system
│   │   ├── base.py          # BaseAgent class
│   │   ├── executor.py      # Agent execution engine
│   │   ├── loop_controller.py # 5-layer loop control
│   │   ├── pr_manager.py    # Git-native PR management
│   │   ├── config.py        # Global agent config
│   │   ├── example_agent.py # Read-only example agent
│   │   └── test_agent.py    # Test agent (creates pages)
│   ├── scripts/             # Utility scripts (tests, analysis, chat client)
│   ├── api/                 # WebSocket handlers
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
- **WebSocket**: Real-time communication on `/ws/{client_id}` endpoint
- **AI Tools**: Custom functions for page management (read_page, edit_page, find_pages, list_all_pages)
- **Agent APIs**: `/api/agents`, `/api/agents/{name}/run`, `/api/prs/*`
- **Git APIs**: `/api/git/branches`, `/api/git/branches/{name}/tags`, `/api/git/checkout`, etc.
- **PR Workflow**:
  - Agents create branches: `agent/<name>/<timestamp>`
  - Approval merges to main and deletes branch
  - Rejection deletes branch (changes kept in git history)
- **CORS**: Configured for frontend connections

### Frontend

- **No Routing**: Context-based state management, no react-router-dom
- **Panel Modes**:
  - Right panel: Chat/Agents tabs (`rightPanelMode`)
  - Center panel: Page view or PR review (`centerPanelMode`)
- **WebSocket Integration**: Automatic connection and reconnection to backend
- **Page Management**: Create, edit, view, delete pages with real-time sync
- **Git Integration**:
  - Branch selector with branch creation/deletion
  - Checkout branches with page reload
- **Agent Management**:
  - Run agents manually from right panel
  - View pending PRs (all agent branches)
  - Click PR to open in center panel for review
  - Approve (merges to main and deletes branch) or Reject (deletes branch)
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
- `sqlalchemy` - Database ORM
- `openai` - AI integration
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

1. **Backend Development**: Run `python main.py` in backend directory
2. **Frontend Development**: Standard npm workflow in frontend directory
3. **Testing**: Run backend tests with `python scripts/run_tests.py`
4. **WebSocket Testing**: Use `python scripts/chat_client.py` for backend testing
5. **Agentic Testing**: Use Playwright MCP to test the full application autonomously - tests UI navigation, page creation/editing, WebSocket chat, and real-time synchronization

## Security Notes

- API keys should be moved to environment variables for production
- WebSocket connections validated per client
- SQL injection prevented via SQLAlchemy ORM
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

## Real-time Agent Updates

### Branch & Page Lifecycle
- **Branch switching**: Agent branches appear immediately when "Run Agent" is pressed
- **Live page creation**: Pages appear in tree as agents create them (via `page_updated` WebSocket messages)
- **Branch cleanup**: Empty branches (no changes) are auto-deleted, reverting to main

### WebSocket Message Types
- `branch_created` / `branch_switched` / `branch_deleted` - Branch lifecycle
- `page_updated` - Real-time page tree updates during agent execution
- `agent_complete` - Agent finished execution

### Implementation Notes
- React 18 batching workaround: Use refs (`reloadFunctionsRef` in AppContext) to call reload functions from WebSocket callbacks with empty deps
- System prompt bubble: Full width styling in ChatInterface
