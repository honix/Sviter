import { Page, PageRevision } from '../types/page';

const API_BASE_URL = 'http://localhost:8000/api';

/**
 * API service for interacting with the backend REST API
 */

// Page API functions
export async function fetchPages(): Promise<Page[]> {
  const response = await fetch(`${API_BASE_URL}/pages`);
  if (!response.ok) {
    throw new Error(`Failed to fetch pages: ${response.statusText}`);
  }
  const data = await response.json();
  return data.pages;
}

export async function fetchPage(title: string): Promise<Page> {
  const response = await fetch(`${API_BASE_URL}/pages/${encodeURIComponent(title)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.statusText}`);
  }
  return response.json();
}

export async function createPage(
  title: string,
  content: string,
  contentJson?: any,
  author: string = 'user',
  tags: string[] = []
): Promise<Page> {
  const response = await fetch(`${API_BASE_URL}/pages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      content,
      content_json: contentJson,
      author,
      tags,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create page: ${response.statusText}`);
  }
  return response.json();
}

export async function updatePage(
  title: string,
  updates: {
    content?: string;
    content_json?: any;
    author?: string;
    tags?: string[];
  }
): Promise<Page> {
  const response = await fetch(`${API_BASE_URL}/pages/${encodeURIComponent(title)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error(`Failed to update page: ${response.statusText}`);
  }
  return response.json();
}

export async function deletePage(title: string, author: string = 'user'): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/pages/${encodeURIComponent(title)}?author=${encodeURIComponent(author)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete page: ${response.statusText}`);
  }
}

// Git History API functions (replaces revisions)
export async function fetchPageHistory(title: string, limit: number = 50): Promise<PageRevision[]> {
  const response = await fetch(`${API_BASE_URL}/pages/${encodeURIComponent(title)}/history?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch page history: ${response.statusText}`);
  }
  const data = await response.json();
  return data.history;
}

export async function fetchPageAtRevision(title: string, commitSha: string): Promise<Page> {
  const response = await fetch(`${API_BASE_URL}/pages/${encodeURIComponent(title)}/revisions/${commitSha}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch page at revision: ${response.statusText}`);
  }
  return response.json();
}
