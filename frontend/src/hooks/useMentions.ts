/**
 * useMentions hook - detects @mentions in input and manages dropdown state
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getApiUrl } from '../utils/url';

export interface User {
  id: string;
  name: string;
  email?: string;
}

interface UseMentionsOptions {
  inputValue: string;
  onMentionSelect: (userId: string) => void;
}

interface UseMentionsResult {
  users: User[];
  filteredUsers: User[];
  isOpen: boolean;
  selectedIndex: number;
  triggerPosition: number | null;
  setSelectedIndex: (index: number) => void;
  selectMention: (user: User) => void;
  closeMention: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

export function useMentions({ inputValue, onMentionSelect }: UseMentionsOptions): UseMentionsResult {
  const [users, setUsers] = useState<User[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerPosition, setTriggerPosition] = useState<number | null>(null);
  const [filterText, setFilterText] = useState('');

  // Fetch users on mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/users`);
        if (response.ok) {
          const data = await response.json();
          setUsers(data.users || []);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    };
    fetchUsers();
  }, []);

  // Detect @ trigger in input
  useEffect(() => {
    // Find the last @ that might be a mention trigger
    const lastAtIndex = inputValue.lastIndexOf('@');

    if (lastAtIndex === -1) {
      setIsOpen(false);
      setTriggerPosition(null);
      setFilterText('');
      return;
    }

    // Check if @ is at start or preceded by whitespace
    const charBefore = lastAtIndex > 0 ? inputValue[lastAtIndex - 1] : ' ';
    if (charBefore !== ' ' && charBefore !== '\n') {
      setIsOpen(false);
      setTriggerPosition(null);
      setFilterText('');
      return;
    }

    // Get text after @
    const textAfterAt = inputValue.slice(lastAtIndex + 1);

    // If there's a space after the partial mention, close
    if (textAfterAt.includes(' ') || textAfterAt.includes('\n')) {
      setIsOpen(false);
      setTriggerPosition(null);
      setFilterText('');
      return;
    }

    // Open dropdown and set filter
    setIsOpen(true);
    setTriggerPosition(lastAtIndex);
    setFilterText(textAfterAt.toLowerCase());
    setSelectedIndex(0);
  }, [inputValue]);

  // Filter users based on partial text
  const filteredUsers = useMemo(() => {
    if (!filterText) return users;
    return users.filter(user =>
      user.name.toLowerCase().includes(filterText) ||
      user.id.toLowerCase().includes(filterText)
    );
  }, [users, filterText]);

  // Select a mention
  const selectMention = useCallback((user: User) => {
    onMentionSelect(user.id);
    setIsOpen(false);
    setTriggerPosition(null);
    setFilterText('');
  }, [onMentionSelect]);

  // Close mention dropdown
  const closeMention = useCallback(() => {
    setIsOpen(false);
    setTriggerPosition(null);
    setFilterText('');
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (!isOpen || filteredUsers.length === 0) return false;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredUsers.length);
        return true;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredUsers.length) % filteredUsers.length);
        return true;
      case 'Enter':
      case 'Tab':
        if (filteredUsers[selectedIndex]) {
          e.preventDefault();
          selectMention(filteredUsers[selectedIndex]);
          return true;
        }
        return false;
      case 'Escape':
        e.preventDefault();
        closeMention();
        return true;
      default:
        return false;
    }
  }, [isOpen, filteredUsers, selectedIndex, selectMention, closeMention]);

  return {
    users,
    filteredUsers,
    isOpen,
    selectedIndex,
    triggerPosition,
    setSelectedIndex,
    selectMention,
    closeMention,
    handleKeyDown
  };
}
