import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { parseMarkdown } from '../../utils/markdown';
import LoadingSpinner from '../common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AlertCircle, FileText } from 'lucide-react';
import { RevisionHistory } from '../revisions/RevisionHistory';
import { PageRevision } from '../../types/page';
import { ProseMirrorEditor, ProseMirrorEditorHandle } from '../editor/ProseMirrorEditor';
import { EditorToolbar } from '../editor/EditorToolbar';

const CenterPanel: React.FC = () => {
  const { state, actions } = useAppContext();
  const { currentPage, viewMode, isLoading, error } = state;
  const { setViewMode, updatePage } = actions;

  const [editContent, setEditContent] = useState('');
  const [editContentJson, setEditContentJson] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'view' | 'edit' | 'history'>('view');
  const [viewingRevision, setViewingRevision] = useState<PageRevision | null>(null);
  const editorRef = useRef<ProseMirrorEditorHandle>(null);
  const [editorView, setEditorView] = useState<any>(null); // Store editor view for toolbar

  // Sync edit content when page changes
  useEffect(() => {
    if (currentPage) {
      setEditContent(currentPage.content);
      setEditContentJson(currentPage.content_json);
      setViewingRevision(null); // Reset revision view when page changes
    }
  }, [currentPage]);

  // Sync activeTab with viewMode for backward compatibility
  useEffect(() => {
    if (viewMode === 'edit' && activeTab !== 'edit') {
      setActiveTab('edit');
    } else if (viewMode === 'view' && activeTab === 'edit') {
      setActiveTab('view');
    }
  }, [viewMode]);

  // Handle editor view ready
  const handleEditorViewReady = (view: any) => {
    setEditorView(view);
  };

  const handleSave = async () => {
    if (currentPage) {
      await updatePage(currentPage.title, {
        content: editContent,
        content_json: editContentJson,
      });
    }
    setViewMode('view');
    setActiveTab('view');
  };

  const handleCancel = () => {
    if (currentPage) {
      setEditContent(currentPage.content);
      setEditContentJson(currentPage.content_json);
    }
    setViewMode('view');
    setActiveTab('view');
  };

  const handleEditorChange = (docJson: any, markdown: string) => {
    setEditContentJson(docJson);
    setEditContent(markdown);
  };

  const handleRevisionSelect = (revision: PageRevision) => {
    setViewingRevision(revision);
    setActiveTab('view');
  };

  const handleRestoreRevision = async (revision: PageRevision) => {
    if (!currentPage) return;

    // TODO: Update to fetch page content at specific commit SHA
    // For now, this function needs to be updated to work with git-based revisions
    // await updatePage(currentPage.title, {
    //   content: revision.content,
    //   content_json: revision.content_json,
    // });
    console.warn('Restore revision needs to be updated for git-based backend');
    setViewingRevision(null);
    setActiveTab('view');
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as 'view' | 'edit' | 'history');
    if (value === 'edit') {
      setViewMode('edit');
      setViewingRevision(null);
    } else if (value === 'view') {
      setViewMode('view');
      if (viewingRevision) {
        setViewingRevision(null);
      }
    } else if (value === 'history') {
      setViewMode('view');
    }
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
          value={activeTab}
          onValueChange={handleTabChange}
          className="h-full flex flex-col"
        >
          <TabsList className="mx-4 mt-4">
            <TabsTrigger value="view">View</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="view" className="flex-1 overflow-hidden mt-0 flex flex-col">
            {viewingRevision && (
              <div className="px-6 pt-4 pb-2">
                <div className="p-3 bg-accent rounded-lg border border-accent-foreground/20">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Viewing Revision #{viewingRevision.revision_number}
                      {viewingRevision.comment && ` - ${viewingRevision.comment}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewingRevision(null)}
                    >
                      Back to current
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <ProseMirrorEditor
                initialContent={viewingRevision?.content || currentPage.content}
                editable={false}
                className="h-full"
              />
            </div>
          </TabsContent>

          <TabsContent value="edit" className="flex-1 overflow-hidden mt-0 flex flex-col">
            <EditorToolbar editorView={editorView} />
            <div className="flex-1 overflow-hidden">
              <ProseMirrorEditor
                ref={editorRef}
                initialContent={currentPage.content}
                editable={true}
                onChange={handleEditorChange}
                onViewReady={handleEditorViewReady}
                className="h-full"
              />
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden mt-0 flex flex-col">
            <div className="flex-1 overflow-hidden">
              <RevisionHistory
                pageId={currentPage.id}
                onRevisionSelect={handleRevisionSelect}
                onRestoreRevision={handleRestoreRevision}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CenterPanel;
