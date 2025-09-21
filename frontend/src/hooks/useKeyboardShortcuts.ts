import { useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';

export const useKeyboardShortcuts = () => {
  const { state, actions } = useAppContext();
  const { currentPage, viewMode } = state;
  const { setViewMode } = actions;

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      const isInputActive = target.tagName === 'INPUT' ||
                           target.tagName === 'TEXTAREA' ||
                           target.contentEditable === 'true';

      // Only handle shortcuts when not typing in inputs
      if (!isInputActive && currentPage) {
        // Ctrl/Cmd + E: Toggle edit mode
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
          e.preventDefault();
          setViewMode(viewMode === 'edit' ? 'view' : 'edit');
        }

        // Escape: Switch to view mode
        if (e.key === 'Escape' && viewMode === 'edit') {
          e.preventDefault();
          setViewMode('view');
        }
      }

      // Global shortcuts (work even in inputs)

      // Ctrl/Cmd + /: Show help (could be implemented later)
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        console.log('Keyboard shortcuts help - to be implemented');
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [currentPage, viewMode, setViewMode]);
};