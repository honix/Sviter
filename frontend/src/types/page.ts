export interface Page {
  title: string; // Unique identifier (used as ID in git backend)
  content: string;
  content_json?: any; // ProseMirror document JSON
  author: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  path: string; // Relative file path in git repo (e.g., "index.md")
  metadata?: any; // YAML frontmatter metadata
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
  title: string; // Display name (without numeric prefix)
  path: string; // Full relative path (e.g., "01-getting-started/02-installation.md")
  type: 'page' | 'folder';
  order: number; // Extracted from numeric prefix
  children?: TreeItem[] | null;
  parent_path: string | null; // Parent folder path (null = root)
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