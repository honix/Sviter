/**
 * Shared color and user identity utilities
 * Used by chat interface and collaborative editor for consistent user colors
 */

/**
 * Convert HSL to hex color string.
 */
const hslToHex = (h: number, s: number, l: number): string => {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

/**
 * Generate a soft pastel color from a string hash.
 * Returns hex color for y-prosemirror compatibility.
 */
export const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return hslToHex(h, 70, 70); // Slightly darker for better visibility
};

/**
 * Generate a darker variant of the pastel color for text/borders.
 */
export const stringToColorDark = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return hslToHex(h, 70, 40);
};

/**
 * Get initials from a user ID.
 * For guests (guest-xxxxx), uses first 2 chars of the ID part.
 * For other users, uses first 2 chars.
 */
export const getInitials = (userId: string | undefined | null): string => {
  if (!userId) return 'U';
  // For guests (guest-xxxxx), use first 2 chars of the ID part
  if (userId.startsWith('guest-')) {
    return userId.slice(6, 8).toUpperCase();
  }
  // For OAuth users, assume format might be full name or email
  // Just use first 2 chars for now
  return userId.slice(0, 2).toUpperCase();
};

/**
 * Get a display name from a user ID.
 * Formats guest IDs more nicely.
 */
export const getDisplayName = (userId: string | undefined): string => {
  if (!userId) return 'Unknown';
  if (userId.startsWith('guest-')) {
    return `Guest ${userId.slice(6, 10).toUpperCase()}`;
  }
  return userId;
};
