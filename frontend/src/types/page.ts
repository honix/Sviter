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

export type ViewMode = 'view' | 'edit';