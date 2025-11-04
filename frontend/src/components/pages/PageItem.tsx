import React, { useState } from 'react';
import { Page } from '../../types/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Check, X, File } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageItemProps {
  page: Page | undefined;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const PageItem: React.FC<PageItemProps> = ({
  page,
  isActive,
  onSelect,
  onDelete
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!page) return null;

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
      onClick={onSelect}
      className={cn(
        "group relative p-3 rounded-lg cursor-pointer transition-all border",
        isActive
          ? 'bg-primary text-primary-foreground border-primary'
          : 'hover:bg-accent hover:text-accent-foreground border-transparent'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <File className="h-4 w-4 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {page.title}
            </div>
            {page.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {page.tags.slice(0, 2).map(tag => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-xs px-1.5 py-0"
                  >
                    {tag}
                  </Badge>
                ))}
                {page.tags.length > 2 && (
                  <span className="text-xs text-muted-foreground">
                    +{page.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delete button */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {showDeleteConfirm ? (
            <div className="flex gap-1">
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
              title="Delete page"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PageItem;