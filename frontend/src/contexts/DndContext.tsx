/**
 * App-wide drag and drop context using dnd-kit.
 * Supports dragging from PageTree to Editor and Chat.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { FileText, Folder, Image } from 'lucide-react';

// Type of item being dragged
export type DragItemType = 'page' | 'image' | 'folder';

// Data attached to dragged items
export interface DragItemData {
  id: string;
  type: DragItemType;
  path: string;
  name: string;
}

// Drop handler signature
export type DropHandler = (item: DragItemData) => void;

// Context value
interface AppDndContextValue {
  draggedItem: DragItemData | null;
  overId: string | null;
  setDraggedItem: (item: DragItemData | null) => void;
  registerDropHandler: (zoneId: string, handler: DropHandler) => void;
  unregisterDropHandler: (zoneId: string) => void;
  setTreeDragEndHandler: (handler: ((event: DragEndEvent) => void) | undefined) => void;
}

const AppDndContext = createContext<AppDndContextValue | null>(null);

export const useAppDnd = () => {
  const ctx = useContext(AppDndContext);
  if (!ctx) {
    throw new Error('useAppDnd must be used within AppDndProvider');
  }
  return ctx;
};

// Get icon for drag overlay
const getItemIcon = (type: DragItemType) => {
  switch (type) {
    case 'folder': return Folder;
    case 'image': return Image;
    default: return FileText;
  }
};

export const AppDndProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [draggedItem, setDraggedItem] = useState<DragItemData | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dropHandlersRef = useRef<Map<string, DropHandler>>(new Map());
  const treeDragEndHandlerRef = useRef<((event: DragEndEvent) => void) | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  );

  const registerDropHandler = useCallback((zoneId: string, handler: DropHandler) => {
    dropHandlersRef.current.set(zoneId, handler);
  }, []);

  const unregisterDropHandler = useCallback((zoneId: string) => {
    dropHandlersRef.current.delete(zoneId);
  }, []);

  const setTreeDragEndHandler = useCallback((handler: ((event: DragEndEvent) => void) | undefined) => {
    treeDragEndHandlerRef.current = handler;
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over?.id as string || null);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { over } = event;

    // Check if dropped on a registered drop zone (editor, chat)
    if (over && draggedItem) {
      const dropZoneId = over.id as string;
      const handler = dropHandlersRef.current.get(dropZoneId);
      if (handler) {
        handler(draggedItem);
        setDraggedItem(null);
        setOverId(null);
        return;
      }
    }

    // Fall back to tree reordering logic
    if (treeDragEndHandlerRef.current) {
      treeDragEndHandlerRef.current(event);
    }

    setDraggedItem(null);
    setOverId(null);
  }, [draggedItem]);

  const handleDragCancel = useCallback(() => {
    setDraggedItem(null);
    setOverId(null);
  }, []);

  const contextValue: AppDndContextValue = {
    draggedItem,
    overId,
    setDraggedItem,
    registerDropHandler,
    unregisterDropHandler,
    setTreeDragEndHandler,
  };

  const DragIcon = draggedItem ? getItemIcon(draggedItem.type) : FileText;

  return (
    <AppDndContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}

        <DragOverlay>
          {draggedItem && (
            <div className="bg-background border-2 border-primary rounded-lg px-3 py-2 shadow-xl">
              <div className="flex items-center gap-2">
                <DragIcon className={`h-4 w-4 ${draggedItem.type === 'folder' ? 'text-yellow-500' : ''}`} />
                <span className="text-sm font-medium">{draggedItem.name}</span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </AppDndContext.Provider>
  );
};
