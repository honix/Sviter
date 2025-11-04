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

export async function fetchPage(pageId: number): Promise<Page> {
  const response = await fetch(`${API_BASE_URL}/pages/${pageId}`);
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
  pageId: number,
  updates: {
    title?: string;
    content?: string;
    content_json?: any;
    author?: string;
    tags?: string[];
  }
): Promise<Page> {
  const response = await fetch(`${API_BASE_URL}/pages/${pageId}`, {
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

export async function deletePage(pageId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/pages/${pageId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`Failed to delete page: ${response.statusText}`);
  }
}

// Revision API functions
export async function fetchRevisions(pageId: number, limit: number = 50): Promise<PageRevision[]> {
  const response = await fetch(`${API_BASE_URL}/pages/${pageId}/revisions?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch revisions: ${response.statusText}`);
  }
  const data = await response.json();
  return data.revisions;
}

export async function fetchRevision(pageId: number, revisionId: number): Promise<PageRevision> {
  const response = await fetch(`${API_BASE_URL}/pages/${pageId}/revisions/${revisionId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch revision: ${response.statusText}`);
  }
  return response.json();
}

export async function createRevision(
  pageId: number,
  content: string,
  contentJson?: any,
  author: string = 'user',
  comment?: string
): Promise<PageRevision> {
  const response = await fetch(`${API_BASE_URL}/pages/${pageId}/revisions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      content_json: contentJson,
      author,
      comment,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create revision: ${response.statusText}`);
  }
  return response.json();
}
