/**
 * Authentication API service
 */
import { getApiUrl } from '../utils/url';

const API_BASE = getApiUrl();
const GUEST_ID_KEY = 'sviter_guest_id';

export interface User {
  id: string;
  type: 'guest' | 'oauth';
  email?: string;
  name?: string;
  oauth_provider?: string;
  created_at: string;
  last_seen_at: string;
}

/**
 * Get guest ID from localStorage
 */
export function getStoredGuestId(): string | null {
  return localStorage.getItem(GUEST_ID_KEY);
}

/**
 * Store guest ID in localStorage
 */
export function storeGuestId(guestId: string): void {
  localStorage.setItem(GUEST_ID_KEY, guestId);
}

/**
 * Clear guest ID from localStorage
 */
export function clearGuestId(): void {
  localStorage.removeItem(GUEST_ID_KEY);
}

/**
 * Create a new guest user
 */
export async function createGuest(): Promise<User> {
  const response = await fetch(`${API_BASE}/auth/guest`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to create guest user');
  }

  return response.json();
}

/**
 * Validate user ID (creates guest if not exists)
 */
export async function validateUser(userId: string): Promise<{ valid: boolean; user_id: string; type: string }> {
  const response = await fetch(`${API_BASE}/auth/validate/${userId}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to validate user');
  }

  return response.json();
}

/**
 * Get current user by ID
 */
export async function getUser(userId: string): Promise<User> {
  const response = await fetch(`${API_BASE}/auth/me?user_id=${userId}`);

  if (!response.ok) {
    throw new Error('User not found');
  }

  return response.json();
}

/**
 * Initialize auth - get or create guest user
 */
export async function initAuth(): Promise<User> {
  const storedId = getStoredGuestId();

  if (storedId) {
    // Validate existing guest
    try {
      const result = await validateUser(storedId);
      if (result.valid) {
        return getUser(result.user_id);
      }
    } catch {
      // Fall through to create new guest
    }
  }

  // Create new guest
  const guest = await createGuest();
  storeGuestId(guest.id);
  return guest;
}
