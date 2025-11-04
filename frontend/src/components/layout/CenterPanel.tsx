import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { parseMarkdown } from '../../utils/markdown';
import LoadingSpinner from '../common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AlertCircle, FileText } from 'lucide-react';

const CenterPanel: React.FC = () => {
  const { state, actions } = useAppContext();
  const { currentPage, viewMode, isLoading, error } = state;
  const { setViewMode, updatePage } = actions;

  const [editContent, setEditContent] = useState('');

  // Sync edit content when page changes
  useEffect(() => {
    if (currentPage) {
      setEditContent(currentPage.content);
    }
  }, [currentPage]);

  const handleSave = async () => {
    if (currentPage && editContent !== currentPage.content) {
      await updatePage(currentPage.id, { content: editContent });
    }
    setViewMode('view');
  };

  const handleCancel = () => {
    if (currentPage) {
      setEditContent(currentPage.content);
    }
    setViewMode('view');
  };

  if (isLoading) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading page..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full bg-background flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Error</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentPage) {
    return (
      <div className="h-full bg-background flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No page selected</h3>
              <p className="text-sm text-muted-foreground">
                Select a page from the left panel or create a new one.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">
            {currentPage.title}
          </h1>

          {viewMode === 'edit' && (
            <div className="flex gap-2">
              <Button onClick={handleSave} size="sm">
                Save
              </Button>
              <Button onClick={handleCancel} variant="outline" size="sm">
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Content Area with Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs
          value={viewMode}
          onValueChange={(value) => setViewMode(value as 'view' | 'edit')}
          className="h-full flex flex-col"
        >
          <TabsList className="mx-4 mt-4">
            <TabsTrigger value="view">View</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
          </TabsList>

          <TabsContent value="view" className="flex-1 overflow-hidden mt-0">
            <ScrollArea className="h-full">
              <div className="p-6">
                <div className="prose dark:prose-invert max-w-none">
                  {parseMarkdown(currentPage.content)}
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="edit" className="flex-1 overflow-hidden mt-0">
            <div className="h-full p-4">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="h-full resize-none font-mono"
                placeholder="Start writing in markdown..."
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CenterPanel;
