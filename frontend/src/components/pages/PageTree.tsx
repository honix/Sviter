import React from 'react';
import { PageTreeItem, Page } from '../../types/page';
import PageItem from './PageItem';
import BranchSwitcher from '../git/BranchSwitcher';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, FileText } from 'lucide-react';

interface PageTreeProps {
  items: PageTreeItem[];
  currentPage: Page | null;
  onPageSelect: (page: Page | null) => void;
  onCreatePage: (title: string) => void;
  onDeletePage: (title: string) => void;
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
    <div className="h-full bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Pages
          </h2>
        </div>

        {/* Branch Switcher */}
        <BranchSwitcher />

        {/* New Page Button */}
        <Button
          onClick={handleCreatePage}
          className="w-full"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Page
        </Button>
      </div>

      {/* Page Tree Content */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No pages yet</p>
              <Button
                onClick={handleCreatePage}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create your first page
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => {
                const page = pages.find(p => p.title === item.title);
                return (
                  <PageItem
                    key={item.title}
                    page={page}
                    isActive={currentPage?.title === item.title}
                    onSelect={() => page && onPageSelect(page)}
                    onDelete={() => onDeletePage(item.title)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default PageTree;