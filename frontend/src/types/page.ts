export interface Page {
  id: number;
  title: string;
  content: string;
  content_json?: any; // ProseMirror document JSON
  author: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface PageRevision {
  id: number;
  page_id: number;
  revision_number: number;
  content: string;
  content_json?: any; // ProseMirror document JSON
  author: string;
  created_at: string;
  comment?: string | null;
}

export interface PageTreeItem {
  id: number;
  title: string;
  children?: PageTreeItem[];
}

export type ViewMode = 'view' | 'edit';