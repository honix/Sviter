import React, { useMemo, useState, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDraggable,
  useDroppable
} from '@dnd-kit/core';
import { TreeItem, Page } from '../../types/page';
import BranchSwitcher from '../git/BranchSwitcher';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, FileText, FolderPlus, GripVertical, ChevronRight, ChevronDown, Folder, FolderOpen, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageTreeProps {
  tree: TreeItem[];
  pages: Page[];
  currentPage: Page | null;
  expandedFolders: string[];
  onPageSelect: (page: Page | null) => void;
  onCreatePage: (title: string) => void;
  onDeletePage: (title: string) => void;
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (path: string) => void;
  onToggleFolder: (folderId: string) => void;
  onMoveItem: (sourcePath: string, targetParentPath: string | null, newOrder: number) => void;
}

// Simple draggable item
const DraggableItem: React.FC<{
  id: string;
  children: React.ReactNode;
}> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("touch-none", isDragging && "opacity-30")}
    >
      {children}
    </div>
  );
};

// Drop zone between items
const DropZone: React.FC<{
  id: string;
  indent: number;
  isOver: boolean;
}> = ({ id, indent, isOver }) => {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className="h-1 -my-0.5 relative z-10"
      style={{ marginLeft: `${indent * 20}px` }}
    >
      <div
        className={cn(
          "absolute inset-x-0 h-0.5 rounded transition-all",
          isOver ? "bg-primary scale-y-[3]" : "bg-transparent"
        )}
      />
    </div>
  );
};

// Folder drop target
const FolderDropTarget: React.FC<{
  id: string;
  isOver: boolean;
  children: React.ReactNode;
}> = ({ id, isOver, children }) => {
  const { setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-lg transition-all",
        isOver && "ring-2 ring-primary bg-primary/10"
      )}
    >
      {children}
    </div>
  );
};

const PageTree: React.FC<PageTreeProps> = ({
  tree,
  pages,
  currentPage,
  expandedFolders,
  onPageSelect,
  onCreatePage,
  onDeletePage,
  onCreateFolder,
  onDeleteFolder,
  onToggleFolder,
  onMoveItem
}) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 }
    })
  );

  // Build flat list with drop zones
  const items = useMemo(() => {
    const result: Array<{
      type: 'item' | 'dropzone';
      item?: TreeItem;
      page?: Page;
      indent: number;
      dropId?: string;
      parentPath: string | null;
      order: number;
    }> = [];

    // Root drop zone at top
    result.push({
      type: 'dropzone',
      indent: 0,
      dropId: 'drop:root:0',
      parentPath: null,
      order: 0
    });

    const processItems = (items: TreeItem[], indent: number, parentPath: string | null) => {
      items.forEach((item, index) => {
        // Add the item
        const page = item.type === 'page'
          ? pages.find(p => p.path === item.path || p.title === item.title)
          : undefined;

        result.push({
          type: 'item',
          item,
          page,
          indent,
          parentPath,
          order: item.order
        });

        // If folder is expanded, process children
        if (item.type === 'folder' && expandedFolders.includes(item.id)) {
          // Drop zone inside folder (at start)
          result.push({
            type: 'dropzone',
            indent: indent + 1,
            dropId: `drop:${item.path}:0`,
            parentPath: item.path,
            order: 0
          });

          if (item.children && item.children.length > 0) {
            processItems(item.children, indent + 1, item.path);
          }
        }

        // Drop zone after this item
        result.push({
          type: 'dropzone',
          indent,
          dropId: `drop:${parentPath || 'root'}:${item.order + 1}`,
          parentPath,
          order: item.order + 1
        });
      });
    };

    processItems(tree, 0, null);
    return result;
  }, [tree, pages, expandedFolders]);

  const draggedItem = draggedId
    ? items.find(i => i.type === 'item' && i.item?.id === draggedId)?.item
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedId(null);
    setOverId(null);

    if (!over) return;

    const sourceItem = items.find(i => i.type === 'item' && i.item?.id === active.id)?.item;
    if (!sourceItem) return;

    const overId = over.id as string;

    // Check if dropping on a folder
    if (overId.startsWith('folder:')) {
      const folderPath = overId.replace('folder:', '');
      onMoveItem(sourceItem.path, folderPath, 1);
      return;
    }

    // Check if dropping on a drop zone
    if (overId.startsWith('drop:')) {
      const parts = overId.split(':');
      const parentPath = parts[1] === 'root' ? null : parts[1];
      const order = parseInt(parts[2], 10);
      onMoveItem(sourceItem.path, parentPath, order);
    }
  };

  const handleDragCancel = () => {
    setDraggedId(null);
    setOverId(null);
  };

  const handleCreatePage = () => {
    const title = prompt('Enter page title:');
    if (title?.trim()) {
      onCreatePage(title.trim());
    }
  };

  const handleCreateFolder = () => {
    const name = prompt('Enter folder name:');
    if (name?.trim()) {
      onCreateFolder(name.trim());
    }
  };

  const renderItem = (item: TreeItem, page: Page | undefined, indent: number) => {
    const isSelected = currentPage?.path === item.path || currentPage?.title === item.title;
    const isExpanded = expandedFolders.includes(item.id);
    const isDragging = draggedId === item.id;

    if (item.type === 'folder') {
      const isDropTarget = overId === `folder:${item.path}`;
      const childCount = item.children?.length || 0;

      return (
        <FolderDropTarget id={`folder:${item.path}`} isOver={isDropTarget && !isDragging}>
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-accent group",
              isDragging && "opacity-30"
            )}
            style={{ paddingLeft: `${8 + indent * 20}px` }}
            onClick={() => onToggleFolder(item.id)}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab flex-shrink-0" />
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            )}
            <span className="text-sm flex-1 truncate">{item.title}</span>
            <span className="text-xs text-muted-foreground">{childCount}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                const msg = childCount > 0
                  ? `Delete folder "${item.title}" and all its contents (${childCount} items)?`
                  : `Delete folder "${item.title}"?`;
                if (confirm(msg)) {
                  onDeleteFolder(item.path);
                }
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </FolderDropTarget>
      );
    }

    // Page item
    return (
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer group",
          isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          isDragging && "opacity-30"
        )}
        style={{ paddingLeft: `${8 + indent * 20}px` }}
        onClick={() => page && onPageSelect(page)}
      >
        <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab flex-shrink-0" />
        <FileText className="h-4 w-4 flex-shrink-0" />
        <span className="text-sm flex-1 truncate">{item.title}</span>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-5 w-5 opacity-0 group-hover:opacity-100",
            isSelected && "hover:bg-primary-foreground/20"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete page "${item.title}"?`)) {
              onDeletePage(item.title);
            }
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    );
  };

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Pages
        </h2>

        <BranchSwitcher />

        <div className="flex gap-2">
          <Button onClick={handleCreatePage} className="flex-1" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Page
          </Button>
          <Button onClick={handleCreateFolder} variant="outline" size="sm" title="New Folder">
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tree Content */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {items.length <= 1 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No pages yet</p>
              <Button onClick={handleCreatePage} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create your first page
              </Button>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div>
                {items.map((entry, index) => {
                  if (entry.type === 'dropzone') {
                    // Only show drop zones when dragging
                    if (!draggedId) return null;

                    return (
                      <DropZone
                        key={entry.dropId}
                        id={entry.dropId!}
                        indent={entry.indent}
                        isOver={overId === entry.dropId}
                      />
                    );
                  }

                  return (
                    <DraggableItem key={entry.item!.id} id={entry.item!.id}>
                      {renderItem(entry.item!, entry.page, entry.indent)}
                    </DraggableItem>
                  );
                })}
              </div>

              <DragOverlay>
                {draggedItem && (
                  <div className="bg-background border-2 border-primary rounded-lg px-3 py-2 shadow-xl">
                    <div className="flex items-center gap-2">
                      {draggedItem.type === 'folder' ? (
                        <Folder className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      <span className="text-sm font-medium">{draggedItem.title}</span>
                    </div>
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default PageTree;
