import React, { useState } from 'react';
import { Page } from '../../types/page';

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
      className={`group relative p-2 rounded-md cursor-pointer transition-colors ${
        isActive
          ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {page.title}
          </div>
          {page.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {page.tags.slice(0, 2).map(tag => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
                >
                  {tag}
                </span>
              ))}
              {page.tags.length > 2 && (
                <span className="px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                  +{page.tags.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Delete button */}
        <div className="flex-shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {showDeleteConfirm ? (
            <div className="flex space-x-1">
              <button
                onClick={confirmDelete}
                className="p-1 text-red-600 hover:text-red-700 text-xs"
                title="Confirm delete"
              >
                ✓
              </button>
              <button
                onClick={cancelDelete}
                className="p-1 text-gray-500 hover:text-gray-600 text-xs"
                title="Cancel"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={handleDelete}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
              title="Delete page"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 102 0v3a1 1 0 11-2 0V9zm4 0a1 1 0 10-2 0v3a1 1 0 102 0V9z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PageItem;