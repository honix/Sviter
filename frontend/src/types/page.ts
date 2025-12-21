export interface Page {
  path: string; // Relative file path in git repo (e.g., "home.md", "agents/index.md")
  content: string; // Plain markdown content (no frontmatter)
  title: string; // Filename (e.g., "home.md")
  // Legacy fields for compatibility - metadata comes from git
  author?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  content_json?: any; // ProseMirror document JSON
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
  title: string; // Filename (e.g., "home.md", "agents")
  path: string; // Full relative path (e.g., "home.md", "agents/index.md")
  type: 'page' | 'folder';
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