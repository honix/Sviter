import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import LoadingSpinner from '../common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, FileText, GitBranch, Code, Eye } from 'lucide-react';
import { RevisionHistory } from '../revisions/RevisionHistory';
import type { PageRevision } from '../../types/page';
import { ProseMirrorEditor, type ProseMirrorEditorHandle } from '../editor/ProseMirrorEditor';
import { CollaborativeEditor } from '../editor/CollaborativeEditor';
import { EditorToolbar } from '../editor/EditorToolbar';
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor';
import { CodeMirrorDiffView } from '../editor/CodeMirrorDiffView';

const CenterPanel: React.FC = () => {
  const { state, actions } = useAppContext();
  const { currentPage, viewMode, isLoading, error, currentBranch, pageUpdateCounter } = state;
  const { setViewMode, updatePage } = actions;

  const [editContent, setEditContent] = useState('');
  const [editContentJson, setEditContentJson] = useState<any>(null);
  const [viewingRevision, setViewingRevision] = useState<PageRevision | null>(null);
  const [viewingRevisionContent, setViewingRevisionContent] = useState<string | null>(null);
  const editorRef = useRef<ProseMirrorEditorHandle>(null);
  const [editorView, setEditorView] = useState<any>(null);

  // For main branch: 'view' | 'edit' | 'history'
  // For other branches: 'diff' | 'history'
  const [mainTab, setMainTab] = useState<'view' | 'edit' | 'history'>('view');
  const [branchTab, setBranchTab] = useState<'diff' | 'history'>('diff');

  // Format toggle only for main branch: 'formatted' | 'raw'
  const [formatMode, setFormatMode] = useState<'formatted' | 'raw'>('formatted');

  const isMainBranch = currentBranch === 'main';

  // Sync edit content when page changes
  useEffect(() => {
    if (currentPage) {
      setEditContent(currentPage.content);
      setEditContentJson(currentPage.content_json);
      setViewingRevision(null);
      setViewingRevisionContent(null);
    }
  }, [currentPage]);

  // Sync mainTab with viewMode for backward compatibility
  useEffect(() => {
    if (isMainBranch) {
      if (viewMode === 'edit' && mainTab !== 'edit') {
        setMainTab('edit');
      } else if (viewMode === 'view' && mainTab === 'edit') {
        setMainTab('view');
      }
    }
  }, [viewMode, isMainBranch]);

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
    setMainTab('view');
  };

  const handleCancel = () => {
    if (currentPage) {
      setEditContent(currentPage.content);
      setEditContentJson(currentPage.content_json);
    }
    setViewMode('view');
    setMainTab('view');
  };

  const handleEditorChange = (docJson: any, markdown: string) => {
    setEditContentJson(docJson);
    setEditContent(markdown);
  };

  const handleCodeMirrorChange = (content: string) => {
    setEditContent(content);
    setEditContentJson(null);
  };

  const handleRevisionSelect = async (revision: PageRevision) => {
    setViewingRevision(revision);
    setViewingRevisionContent(null); // Clear while loading
    if (isMainBranch) {
      setMainTab('view');
    }
    // Fetch revision content
    if (currentPage) {
      try {
        const response = await fetch(
          `http://localhost:8000/api/pages/${encodeURIComponent(currentPage.path)}/at-ref?ref=${revision.sha}`
        );
        if (response.ok) {
          const data = await response.json();
          setViewingRevisionContent(data.content || '');
        }
      } catch (err) {
        console.error('Failed to fetch revision content:', err);
      }
    }
  };

  const handleMainTabChange = (value: string) => {
    setMainTab(value as 'view' | 'edit' | 'history');
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

  const handleBranchTabChange = (value: string) => {
    setBranchTab(value as 'diff' | 'history');
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

  // Main branch: View | Edit | History with Formatted/Raw toggle
  if (isMainBranch) {
    return (
      <div className="h-full bg-background flex flex-col">
        {/* Header */}
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">
              {currentPage.title}
            </h1>
            {/* Save/Cancel only for raw edit mode - collaborative mode auto-saves */}
            {viewMode === 'edit' && formatMode === 'raw' && (
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
            value={mainTab}
            onValueChange={handleMainTabChange}
            className="h-full flex flex-col"
          >
            <div className="flex items-center justify-between mx-4 mt-4">
              <TabsList>
                <TabsTrigger value="view">View</TabsTrigger>
                <TabsTrigger value="edit">Edit</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              {/* Format toggle for View and Edit tabs */}
              {(mainTab === 'view' || mainTab === 'edit') && (
                <Tabs value={formatMode} onValueChange={(v) => setFormatMode(v as 'formatted' | 'raw')}>
                  <TabsList>
                    <TabsTrigger value="formatted">
                      <Eye className="h-4 w-4 mr-1.5" />
                      Formatted
                    </TabsTrigger>
                    <TabsTrigger value="raw">
                      <Code className="h-4 w-4 mr-1.5" />
                      Raw
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>

            <TabsContent value="view" className="flex-1 overflow-hidden mt-0 flex flex-col">
              {viewingRevision && (
                <div className="px-6 pt-4 pb-2">
                  <div className="p-3 bg-accent rounded-lg border border-accent-foreground/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Viewing Revision {viewingRevision.short_sha}
                        {viewingRevision.message && ` - ${viewingRevision.message}`}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setViewingRevision(null);
                          setViewingRevisionContent(null);
                        }}
                      >
                        Back to current
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-auto min-h-0">
                {viewingRevision && viewingRevisionContent === null ? (
                  <div className="p-4 text-muted-foreground">Loading revision...</div>
                ) : formatMode === 'raw' ? (
                  <CodeMirrorEditor
                    content={viewingRevisionContent ?? currentPage.content ?? ''}
                    editable={false}
                    className="h-full"
                  />
                ) : (
                  <ProseMirrorEditor
                    key={`view-${currentPage.title}-${viewingRevision?.sha || 'current'}`}
                    initialContent={viewingRevisionContent ?? currentPage.content ?? ''}
                    editable={false}
                    className="h-full"
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="edit" className="flex-1 overflow-hidden mt-0 flex flex-col">
              <div className="flex-1 overflow-hidden min-h-0">
                {formatMode === 'raw' ? (
                  <>
                    <EditorToolbar editorView={null} />
                    <CodeMirrorEditor
                      content={editContent}
                      editable={true}
                      onChange={handleCodeMirrorChange}
                      className="h-full"
                    />
                  </>
                ) : (
                  /* Collaborative editor with Yjs - auto-saves, no manual save needed */
                  <CollaborativeEditor
                    key={`collab-${currentPage.path}`}
                    pagePath={currentPage.path}
                    pageTitle={currentPage.title}
                    initialContent={currentPage.content || ''}
                    className="h-full"
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="history" className="flex-1 overflow-hidden mt-0 flex flex-col">
              <div className="flex-1 overflow-hidden">
                <RevisionHistory
                  pageTitle={currentPage.title}
                  onRevisionSelect={handleRevisionSelect}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  // Other branches: Diff | History (no format toggle, always raw)
  return (
    <div className="h-full bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">
            {currentPage.title}
          </h1>
        </div>
      </div>

      {/* Content Area with Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs
          value={branchTab}
          onValueChange={handleBranchTabChange}
          className="h-full flex flex-col"
        >
          <div className="flex items-center justify-between mx-4 mt-4">
            <TabsList>
              <TabsTrigger value="diff">
                <GitBranch className="h-4 w-4 mr-1.5" />
                Diff
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            {/* Branch indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <GitBranch className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-blue-600 dark:text-blue-400">
                <code className="font-mono">{currentBranch}</code> vs main
              </span>
            </div>
          </div>

          <TabsContent value="diff" className="flex-1 overflow-hidden mt-0 flex flex-col">
            <div className="flex-1 overflow-auto min-h-0">
              <CodeMirrorDiffView
                pagePath={currentPage.path}
                branchName={currentBranch}
                refreshTrigger={pageUpdateCounter}
                className="h-full"
              />
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden mt-0 flex flex-col">
            <div className="flex-1 overflow-hidden">
              <RevisionHistory
                pageTitle={currentPage.title}
                onRevisionSelect={handleRevisionSelect}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CenterPanel;
