import React from 'react';
import { PageTreeItem, Page } from '../../types/page';
import PageItem from './PageItem';

interface PageTreeProps {
  items: PageTreeItem[];
  currentPage: Page | null;
  onPageSelect: (page: Page | null) => void;
  onCreatePage: (title: string) => void;
  onDeletePage: (id: number) => void;
  pages: Page[];
}

const PageTree: React.FC<PageTreeProps> = ({
  items,
  currentPage,
  onPageSelect,
  onCreatePage,
  onDeletePage,
  pages
}) => {
  const handleCreatePage = () => {
    const title = prompt('Enter page title:');
    if (title && title.trim()) {
      onCreatePage(title.trim());
    }
  };

  return (
    <div className="h-full bg-white dark:bg-gray-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Pages
        </h2>
        <button
          onClick={handleCreatePage}
          className="mt-2 w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + New Page
        </button>
      </div>

      {/* Page Tree Content */}
      <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
        <div className="space-y-1">
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p className="text-sm">No pages yet</p>
              <button
                onClick={handleCreatePage}
                className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
              >
                Create your first page
              </button>
            </div>
          ) : (
            items.map((item) => {
              const page = pages.find(p => p.id === item.id);
              return (
                <PageItem
                  key={item.id}
                  page={page}
                  isActive={currentPage?.id === item.id}
                  onSelect={() => page && onPageSelect(page)}
                  onDelete={() => onDeletePage(item.id)}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default PageTree;