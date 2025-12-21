import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Trash2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TreeItem } from '../../types/page';

interface FolderItemProps {
  folder: TreeItem;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  indentLevel: number;
  isDragging?: boolean;
  isOver?: boolean;
}

const FolderItem: React.FC<FolderItemProps> = ({
  folder,
  isExpanded,
  onToggle,
  onDelete,
  indentLevel,
  isDragging,
  isOver
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const childCount = folder.children?.length || 0;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
    setShowDeleteConfirm(false);
  };

  const cancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(false);
  };

  return (
    <div
      onClick={onToggle}
      className={cn(
        "group relative p-3 rounded-lg cursor-pointer transition-all border",
        "hover:bg-accent hover:text-accent-foreground border-transparent",
        isDragging && "opacity-50",
        isOver && "bg-accent/50 border-primary border-dashed"
      )}
      style={{ paddingLeft: `${12 + indentLevel * 16}px` }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {/* Expand/Collapse chevron */}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          )}

          {/* Folder icon */}
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 flex-shrink-0 text-yellow-500" />
          ) : (
            <Folder className="h-4 w-4 flex-shrink-0 text-yellow-500" />
          )}

          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {folder.title}
            </div>
            <div className="text-xs text-muted-foreground">
              {childCount} {childCount === 1 ? 'item' : 'items'}
            </div>
          </div>
        </div>

        {/* Delete button */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {showDeleteConfirm ? (
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
              <Button
                onClick={confirmDelete}
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Confirm delete"
              >
                <Check className="h-3 w-3 text-green-600" />
              </Button>
              <Button
                onClick={cancelDelete}
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="Cancel"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleDelete}
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              disabled={childCount > 0}
              title={childCount > 0 ? "Cannot delete non-empty folder" : "Delete folder"}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FolderItem;
