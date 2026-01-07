// Supported file types
export type FileType = 'markdown' | 'csv' | 'tsx' | 'image' | 'unknown';

export interface Page {
  path: string; // Relative file path in git repo (e.g., "home.md", "data.csv", "view.tsx")
  content: string; // File content (markdown, CSV, or TSX source)
  title: string; // Filename (e.g., "home.md", "tasks.csv")
  file_type: FileType; // Type of file
  view_path: string | null; // Path to view template (e.g., "views/user.json.tsx") or null
  // CSV-specific fields
  headers?: string[]; // CSV column headers
  rows?: Record<string, string>[]; // CSV rows as objects
  // Legacy fields for compatibility - metadata comes from git
  author?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  content_json?: any; // ProseMirror document JSON (markdown only)
}

export interface PageRevision {
  sha: string; // Git commit SHA
  short_sha: string; // Short commit SHA (7 chars)
  message: string; // Commit message
  author: string;
  date: string; // ISO date string
  timestamp: number; // Unix timestamp
}

export interface PageTreeItem {
  title: string; // Use title as unique identifier
  path: string; // File path
  children?: PageTreeItem[];
}

// Enhanced tree item with folder support
export interface TreeItem {
  id: string; // Unique identifier (full path without extension)
  title: string; // Filename (e.g., "home.md", "tasks.csv", "agents")
  path: string; // Full relative path (e.g., "home.md", "agents/index.md", "data.csv")
  type: 'page' | 'folder';
  file_type?: FileType; // Type of file (only for pages, not folders)
  children?: TreeItem[] | null;
  parent_path: string | null; // Parent folder path (null = root)
  order?: number; // Legacy - items are now sorted alphabetically
}

// Move operation payload
export interface MoveOperation {
  sourcePath: string;
  targetParentPath: string | null; // null = root
  newOrder: number;
}

// Folder create payload
export interface FolderCreate {
  name: string;
  parentPath: string | null; // null = root
}

export type ViewMode = 'view' | 'edit';