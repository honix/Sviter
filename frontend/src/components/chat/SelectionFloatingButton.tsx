import React, { useEffect, useState, useRef } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useSelection } from '../../contexts/SelectionContext';

const BUTTON_WIDTH = 110; // Approximate button width
const BUTTON_HEIGHT = 32; // Approximate button height

export const SelectionFloatingButton: React.FC = () => {
  const { state, addToContext } = useSelection();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!state.pendingSelection) {
      setPosition(null);
      return;
    }

    // Get selection position
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setPosition(null);
      return;
    }

    const range = selection.getRangeAt(0);

    // Get all client rects - for multi-line selections, use the last rect
    const rects = range.getClientRects();
    if (rects.length === 0) {
      setPosition(null);
      return;
    }

    // Use the last rect (end of selection) for positioning
    const lastRect = rects[rects.length - 1];

    // Get center panel bounds
    const centerPanel = document.querySelector('[data-selection-area="center-panel"]');
    if (!centerPanel) {
      setPosition(null);
      return;
    }

    const panelRect = centerPanel.getBoundingClientRect();

    // Position to the right of the last rect (end of selection)
    let left = lastRect.right + 8;
    let top = lastRect.top;

    // Only constrain if button would overflow right edge of panel
    const maxRight = panelRect.right - 16;
    if (left + BUTTON_WIDTH > maxRight) {
      // Position to the left of the last rect instead
      left = Math.max(lastRect.left - BUTTON_WIDTH - 8, panelRect.left + 8);
    }

    // Constrain top if too close to panel top
    if (top < panelRect.top + 8) {
      top = lastRect.bottom + 4;
    }

    setPosition({ top, left });
  }, [state.pendingSelection]);

  if (!state.pendingSelection || !position) return null;

  return (
    <button
      ref={buttonRef}
      onClick={addToContext}
      className="fixed z-50 flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md bg-pink-400 text-white hover:bg-pink-500 shadow-lg transition-colors"
      style={{
        top: position.top,
        left: position.left,
      }}
      title="Add selection to chat context"
    >
      <MessageSquarePlus className="h-3.5 w-3.5" />
      <span>Add to chat</span>
    </button>
  );
};
