/**
 * MentionDropdown - Shows list of users when @ is typed in chat input
 */
import { useEffect, useRef } from 'react';
import { stringToColor, getInitials } from '../../utils/colors';
import type { User } from '../../hooks/useMentions';

interface MentionDropdownProps {
  users: User[];
  isOpen: boolean;
  selectedIndex: number;
  onSelect: (user: User) => void;
  onHover: (index: number) => void;
}

export function MentionDropdown({
  users,
  isOpen,
  selectedIndex,
  onSelect,
  onHover
}: MentionDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen || users.length === 0) {
    return null;
  }

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto bg-popover border border-border rounded-md shadow-lg z-50"
    >
      {users.map((user, index) => (
        <div
          key={user.id}
          ref={index === selectedIndex ? selectedRef : undefined}
          className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'hover:bg-muted'
          }`}
          onClick={() => onSelect(user)}
          onMouseEnter={() => onHover(index)}
        >
          {/* Avatar */}
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
            style={{ backgroundColor: stringToColor(user.id) }}
          >
            {getInitials(user.id, user.name)}
          </div>
          {/* Name */}
          <span className="truncate flex-1">{user.name}</span>
          {/* Email if different from name */}
          {user.email && user.email !== user.name && (
            <span className="text-xs text-muted-foreground truncate">
              {user.email}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default MentionDropdown;
