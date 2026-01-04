/**
 * Authentication API service with OAuth and JWT support
 */
import { getApiUrl } from '../utils/url';

const API_BASE = getApiUrl();

// Storage keys
const ACCESS_TOKEN_KEY = 'sviter_access_token';
const REFRESH_TOKEN_KEY = 'sviter_refresh_token';
const GUEST_ID_KEY = 'sviter_guest_id'; // Legacy, for migration

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  type: 'guest' | 'oauth';
  email?: string;
  name?: string;
  oauth_provider?: string;
  created_at: string;
  last_seen_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface AuthProvider {
  id: string;
  name: string;
  icon: string;
}

export interface ProvidersResponse {
  providers: AuthProvider[];
  guest_enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Storage
// ─────────────────────────────────────────────────────────────────────────────

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function storeTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(GUEST_ID_KEY); // Clear legacy too
}

// Legacy guest ID functions (for migration)
export function getStoredGuestId(): string | null {
  return localStorage.getItem(GUEST_ID_KEY);
}

export function storeGuestId(guestId: string): void {
  localStorage.setItem(GUEST_ID_KEY, guestId);
}

export function clearGuestId(): void {
  localStorage.removeItem(GUEST_ID_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Headers Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get authorization headers for API requests
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get list of enabled authentication providers
 */
export async function getProviders(): Promise<ProvidersResponse> {
  const response = await fetch(`${API_BASE}/auth/providers`);

  if (!response.ok) {
    throw new Error('Failed to fetch providers');
  }

  return response.json();
}

/**
 * Create a new guest user and get JWT tokens
 */
export async function createGuest(): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE}/auth/guest`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to create guest user');
  }

  return response.json();
}

/**
 * Refresh access token using refresh token
 */
export async function refreshTokens(): Promise<TokenResponse> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    throw new Error('Failed to refresh tokens');
  }

  return response.json();
}

/**
 * Get current user info using access token
 */
export async function getUser(): Promise<User> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_BASE}/auth/me?token=${encodeURIComponent(accessToken)}`);

  if (response.status === 401) {
    // Try to refresh
    try {
      const tokens = await refreshTokens();
      storeTokens(tokens.access_token, tokens.refresh_token);
      return tokens.user;
    } catch {
      throw new Error('Session expired');
    }
  }

  if (!response.ok) {
    throw new Error('Failed to get user');
  }

  return response.json();
}

/**
 * Get OAuth login URL for a provider
 */
export function getLoginUrl(provider: string, guestId?: string): string {
  const params = new URLSearchParams();
  if (guestId) {
    params.set('guest_id', guestId);
  }
  const queryString = params.toString();
  return `${API_BASE}/auth/login/${provider}${queryString ? `?${queryString}` : ''}`;
}

/**
 * Legacy: Validate user ID (for backward compatibility)
 */
export async function validateUser(
  userId: string
): Promise<{ valid: boolean; user_id: string; type: string }> {
  const response = await fetch(`${API_BASE}/auth/validate/${userId}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to validate user');
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialize authentication
 *
 * Flow:
 * 1. Check URL for OAuth callback tokens
 * 2. Try existing JWT tokens
 * 3. Migrate legacy guest ID if present
 * 4. Create new guest if allowed
 */
export async function initAuth(): Promise<{ user: User | null; providers: ProvidersResponse }> {
  // Check URL for OAuth callback tokens
  const urlParams = new URLSearchParams(window.location.search);
  const callbackAccessToken = urlParams.get('access_token');
  const callbackRefreshToken = urlParams.get('refresh_token');

  if (callbackAccessToken && callbackRefreshToken) {
    // Store tokens from OAuth callback
    storeTokens(callbackAccessToken, callbackRefreshToken);
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
  }

  // Get available providers
  const providers = await getProviders();

  // Try existing tokens
  const accessToken = getAccessToken();
  if (accessToken) {
    try {
      const user = await getUser();
      return { user, providers };
    } catch {
      // Token invalid, continue
      clearTokens();
    }
  }

  // Try legacy guest migration
  const legacyGuestId = getStoredGuestId();
  if (legacyGuestId && providers.guest_enabled) {
    try {
      // Validate legacy guest and get new tokens
      await validateUser(legacyGuestId);
      const tokens = await createGuest();
      storeTokens(tokens.access_token, tokens.refresh_token);
      clearGuestId(); // Remove legacy storage
      return { user: tokens.user, providers };
    } catch {
      // Continue to create new guest
      clearGuestId();
    }
  }

  // Create new guest if enabled
  if (providers.guest_enabled) {
    try {
      const tokens = await createGuest();
      storeTokens(tokens.access_token, tokens.refresh_token);
      return { user: tokens.user, providers };
    } catch {
      // Guest creation failed
      return { user: null, providers };
    }
  }

  // No authentication available - user needs to login with OAuth
  return { user: null, providers };
}
