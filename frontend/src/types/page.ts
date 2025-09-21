export interface Page {
  id: number;
  title: string;
  content: string;
  author: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface PageTreeItem {
  id: number;
  title: string;
  children?: PageTreeItem[];
}

export type ViewMode = 'view' | 'edit';