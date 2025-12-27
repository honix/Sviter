import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { useAppContext } from './AppContext';

interface SelectionData {
  text: string;
  lineCount: number;
  filePath: string | null;
}

interface SelectionState {
  // Current active selection (captured but not yet added to context)
  pendingSelection: SelectionData | null;
  // Stack of added contexts (user clicked to add them)
  addedContexts: SelectionData[];
}

type SelectionAction =
  | { type: 'SET_PENDING'; payload: SelectionData }
  | { type: 'CLEAR_PENDING' }
  | { type: 'ADD_TO_CONTEXT' }
  | { type: 'ADD_PATH_TO_CONTEXT'; payload: string }
  | { type: 'REMOVE_CONTEXT'; payload: number }
  | { type: 'CLEAR_ALL_CONTEXTS' }
  | { type: 'CLEAR_ALL' };

const initialState: SelectionState = {
  pendingSelection: null,
  addedContexts: [],
};

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'SET_PENDING':
      return { ...state, pendingSelection: action.payload };
    case 'CLEAR_PENDING':
      return { ...state, pendingSelection: null };
    case 'ADD_TO_CONTEXT':
      // Add pending selection to stack
      if (!state.pendingSelection) return state;
      return {
        pendingSelection: null,
        addedContexts: [...state.addedContexts, state.pendingSelection],
      };
    case 'ADD_PATH_TO_CONTEXT':
      // Add a path reference for AI to read/use
      return {
        ...state,
        addedContexts: [...state.addedContexts, {
          text: `[path: ${action.payload}]`,
          lineCount: 1,
          filePath: action.payload,
        }],
      };
    case 'REMOVE_CONTEXT':
      return {
        ...state,
        addedContexts: state.addedContexts.filter((_, i) => i !== action.payload),
      };
    case 'CLEAR_ALL_CONTEXTS':
      return { ...state, addedContexts: [] };
    case 'CLEAR_ALL':
      return initialState;
    default:
      return state;
  }
}

interface SelectionContextValue {
  state: SelectionState;
  addToContext: () => void;
  addPathToContext: (path: string) => void;
  removeContext: (index: number) => void;
  clearAllContexts: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return context;
}

interface SelectionProviderProps {
  children: React.ReactNode;
}

export function SelectionProvider({ children }: SelectionProviderProps) {
  const [state, dispatch] = useReducer(selectionReducer, initialState);
  const { state: appState } = useAppContext();

  // Use ref to access current page path without triggering effect re-runs
  const currentPagePathRef = useRef<string | null>(null);
  useEffect(() => {
    currentPagePathRef.current = appState.currentPage?.path ?? null;
  }, [appState.currentPage?.path]);

  const addToContext = useCallback(() => {
    dispatch({ type: 'ADD_TO_CONTEXT' });
  }, []);

  const addPathToContext = useCallback((path: string) => {
    dispatch({ type: 'ADD_PATH_TO_CONTEXT', payload: path });
  }, []);

  const removeContext = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_CONTEXT', payload: index });
  }, []);

  const clearAllContexts = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL_CONTEXTS' });
  }, []);

  // Listen to selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        // Selection cleared
        dispatch({ type: 'CLEAR_PENDING' });
        return;
      }

      const text = selection.toString();
      if (!text.trim()) {
        dispatch({ type: 'CLEAR_PENDING' });
        return;
      }

      // Check if selection is within center panel
      const anchorNode = selection.anchorNode;
      if (!anchorNode) return;

      const centerPanel = document.querySelector('[data-selection-area="center-panel"]');
      if (!centerPanel) return;

      // Check if the anchor node is within the center panel
      const anchorElement = anchorNode.nodeType === Node.ELEMENT_NODE
        ? anchorNode as Element
        : anchorNode.parentElement;

      if (!anchorElement || !centerPanel.contains(anchorElement)) {
        // Selection is outside center panel - clear pending
        dispatch({ type: 'CLEAR_PENDING' });
        return;
      }

      // Calculate line count
      const lineCount = text.split('\n').length;

      // Get current page path
      const filePath = currentPagePathRef.current;

      dispatch({
        type: 'SET_PENDING',
        payload: { text, lineCount, filePath },
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const value: SelectionContextValue = {
    state,
    addToContext,
    addPathToContext,
    removeContext,
    clearAllContexts,
  };

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}
