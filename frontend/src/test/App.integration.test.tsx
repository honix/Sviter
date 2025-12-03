import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// Mock all service modules before importing App
vi.mock('../services/api', () => ({
  fetchPages: vi.fn(() => Promise.resolve([])),
  fetchPage: vi.fn(() => Promise.resolve({ title: 'Test', content: '' })),
  createPage: vi.fn(),
  updatePage: vi.fn(),
  deletePage: vi.fn(),
  fetchPageHistory: vi.fn(() => Promise.resolve([])),
  fetchPageAtRevision: vi.fn(),
}))

vi.mock('../services/tree-api', () => ({
  treeApi: {
    getTree: vi.fn(() => Promise.resolve([])),
    moveItem: vi.fn(),
    createFolder: vi.fn(),
    deleteFolder: vi.fn(),
  },
}))

vi.mock('../services/git-api', () => ({
  GitAPI: {
    listBranches: vi.fn(() => Promise.resolve(['main'])),
    getCurrentBranch: vi.fn(() => Promise.resolve('main')),
    checkoutBranch: vi.fn(),
    createBranch: vi.fn(),
    deleteBranch: vi.fn(),
    getBranchDiff: vi.fn(() => Promise.resolve('')),
    getBranchDiffStats: vi.fn(() => Promise.resolve({ files_changed: [], summary: '' })),
    mergeBranch: vi.fn(),
  },
}))

vi.mock('../services/websocket', () => ({
  WebSocketService: vi.fn(),
  createWebSocketService: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    sendChatMessage: vi.fn(),
    onMessage: vi.fn(() => vi.fn()),
    onStatusChange: vi.fn(() => vi.fn()),
    getConnectionStatus: vi.fn(() => 'disconnected'),
  })),
}))

vi.mock('../services/agents-api', () => ({
  agentsApi: {
    list: vi.fn(() => Promise.resolve([])),
    run: vi.fn(),
    getPRs: vi.fn(() => Promise.resolve([])),
  },
}))

// Mock fetch globally for any unmocked API calls
global.fetch = vi.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({}),
})) as unknown as typeof fetch

describe('App Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', async () => {
    // Dynamic import after mocks are set up
    const { default: App } = await import('../App')

    const { container } = render(<App />)

    // App container should exist
    expect(container.querySelector('.App')).toBeInTheDocument()
  })

  it('has document body', async () => {
    const { default: App } = await import('../App')

    render(<App />)

    // Basic sanity check
    expect(document.body).toBeInTheDocument()
  })
})
