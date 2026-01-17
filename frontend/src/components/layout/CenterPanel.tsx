import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, FileText, GitBranch, Code, Eye, Cloud, CloudOff, CloudUpload, AlertTriangle, Loader2, Pencil, History } from 'lucide-react';
import { RevisionHistory } from '../revisions/RevisionHistory';
import type { PageRevision, FileType } from '../../types/page';
import { ProseMirrorEditor } from '../editor/ProseMirrorEditor';
import { CollaborativeEditor, type CollabStatus } from '../editor/CollaborativeEditor';
import { CollaborativeCodeMirrorEditor } from '../editor/CollaborativeCodeMirrorEditor';
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor';
import { CodeMirrorDiffView } from '../editor/CodeMirrorDiffView';
import { CSVEditor } from '../editor/CSVEditor';
import { ViewRuntime } from '../views/ViewRuntime';
import { BranchProvider } from '../../contexts/BranchContext';
import { SelectionFloatingButton } from '../chat/SelectionFloatingButton';
import { stringToColor, getInitials } from '../../utils/colors';
import { setEditingState } from '../../services/collab';
import { ThreadsAPI, type ThreadFile } from '../../services/threads-api';
import { getApiUrl } from '../../utils/url';
import { isImagePath } from '../../utils/files';
import { toast } from 'sonner';

// Extract filename from path
const getFileName = (path: string): string => {
  const parts = path.split('/');
  return parts[parts.length - 1];
};

// Info card shown when viewing a view template directly
const ViewTemplateInfo: React.FC<{ path: string }> = ({ path }) => {
  const filename = getFileName(path);
  const parts = filename.split('.');
  const viewType = parts.slice(0, -1).join('.');

  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-muted-foreground">View for <code className="px-1.5 py-0.5 bg-muted rounded text-sm">*.{viewType}</code></p>
    </div>
  );
};

// Render filename with dimmed extension
const FileName: React.FC<{ path: string; className?: string }> = ({ path, className }) => {
  const name = getFileName(path);
  const lastDot = name.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) {
    return <span className={className}>{name}</span>;
  }
  const baseName = name.slice(0, lastDot);
  const ext = name.slice(lastDot);
  return (
    <span className={className}>
      {baseName}
      <span className="opacity-30">{ext}</span>
    </span>
  );
};

const CenterPanel: React.FC = () => {
  const { state, actions } = useAppContext();
  const { currentPage, viewMode, isLoading, error, currentBranch, pageUpdateCounter, threads, pages } = state;
  const { setViewMode, setCurrentPage } = actions;
  const { userId, user } = useAuth();

  const [viewingRevision, setViewingRevision] = useState<PageRevision | null>(null);
  const [viewingRevisionContent, setViewingRevisionContent] = useState<string | null>(null);

  // For main branch: 'view' | 'edit' | 'history'
  const [mainTab, setMainTab] = useState<'view' | 'edit' | 'history'>('view');
  // For other branches: 'preview' | 'diff' | 'history' (from context for URL sync)
  const { branchViewMode } = state;
  const setBranchViewMode = actions.setBranchViewMode;

  // Format toggle only for main branch: 'formatted' | 'raw'
  const [formatMode, setFormatMode] = useState<'formatted' | 'raw'>('formatted');

  // Collaborative editing status (from editor components)
  const [collabStatus, setCollabStatus] = useState<CollabStatus | null>(null);

  // Conflict resolution state
  const [conflictFiles, setConflictFiles] = useState<ThreadFile[]>([]);
  const [conflictLoading, setConflictLoading] = useState(false);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [titleSaving, setTitleSaving] = useState(false);
  const titleSavingRef = useRef(false); // Ref to track saving state for closures
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Find thread for current branch
  const currentThread = threads.find(t => t.branch === currentBranch);
  const isResolving = currentThread?.status === 'resolving';

  // View template state (for typed data views)
  const [viewTemplate, setViewTemplate] = useState<{ path: string; content: string } | null>(null);
  const [viewTemplateLoading, setViewTemplateLoading] = useState(false);

  // Fetch view template when currentPage has view_path
  useEffect(() => {
    const viewPath = currentPage?.view_path;
    if (!viewPath) {
      setViewTemplate(null);
      return;
    }

    // Skip if we already have this view template cached
    if (viewTemplate?.path === viewPath) {
      return;
    }

    setViewTemplateLoading(true);
    fetch(`${getApiUrl()}/api/pages/${encodeURIComponent(viewPath)}`)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch view: ${res.statusText}`);
        return res.json();
      })
      .then(page => {
        setViewTemplate({ path: viewPath, content: page.content || '' });
      })
      .catch(err => {
        console.error('Failed to load view template:', err);
        setViewTemplate(null);
      })
      .finally(() => {
        setViewTemplateLoading(false);
      });
  }, [currentPage?.view_path, viewTemplate?.path]);

  // Check if a TSX file is a view template (matches *.*.tsx pattern like kanban.csv.tsx)
  const isViewTemplate = useMemo(() => {
    if (!currentPage?.path) return false;
    const filename = getFileName(currentPage.path);
    // View templates have pattern: type.format.tsx (at least 3 parts)
    const parts = filename.split('.');
    return parts.length >= 3 && parts[parts.length - 1] === 'tsx';
  }, [currentPage?.path]);

  // Determine file type from current page
  const fileType: FileType = useMemo(() => {
    if (!currentPage) return 'markdown';
    if (currentPage.file_type && currentPage.file_type !== 'unknown') return currentPage.file_type;
    // Fallback to extension-based detection
    const path = currentPage.path;
    if (path.endsWith('.csv')) return 'csv';
    if (path.endsWith('.tsx')) return 'tsx';
    if (isImagePath(path)) return 'image';
    if (path.endsWith('.md')) return 'markdown';
    // Unknown file type
    return 'unknown';
  }, [currentPage?.path, currentPage?.file_type]);

  // Handle collab status changes from editors
  const handleCollabStatusChange = useCallback((status: CollabStatus) => {
    setCollabStatus(status);
  }, []);

  // Handle wiki link clicks - navigate to page by path
  const handleWikiLinkClick = useCallback((pagePath: string) => {
    const targetPage = pages.find(p => p.path === pagePath);
    if (targetPage) {
      setCurrentPage(targetPage);
    } else {
      console.warn(`Wiki link target not found: ${pagePath}`);
    }
  }, [pages, setCurrentPage]);

  // Status bar component for collaborative editing
  const CollabStatusBar = () => {
    if (!collabStatus) return null;

    const { connectionStatus, remoteUsers, saveStatus } = collabStatus;
    const isConnected = connectionStatus === 'connected';
    const currentUserColor = userId ? stringToColor(userId) : '#888';
    const currentUserInitials = userId ? getInitials(userId, user?.name) : '?';

    return (
      <div className="flex items-center gap-2">
        {/* All users avatars (current + remote) */}
        <div className="flex -space-x-1.5">
          {/* Current user */}
          <div
            className="w-5 h-5 rounded-full border-2 border-background flex items-center justify-center text-[9px] font-medium text-white shadow-sm ring-1 ring-primary/30"
            style={{ backgroundColor: currentUserColor }}
            title="You"
          >
            {currentUserInitials}
          </div>
          {/* Remote users */}
          {remoteUsers.slice(0, 3).map((user) => (
            <div
              key={user.id}
              className="w-5 h-5 rounded-full border border-background flex items-center justify-center text-[9px] font-medium text-white shadow-sm"
              style={{ backgroundColor: user.color }}
              title={user.name}
            >
              {user.initials}
            </div>
          ))}
          {remoteUsers.length > 3 && (
            <div className="w-5 h-5 rounded-full border border-background bg-muted flex items-center justify-center text-[9px] font-medium shadow-sm">
              +{remoteUsers.length - 3}
            </div>
          )}
        </div>

        {/* Cloud status icon */}
        {!isConnected ? (
          <span title="Connecting..."><CloudOff className="h-4 w-4 text-muted-foreground animate-pulse" /></span>
        ) : saveStatus === 'saving' ? (
          <span title="Saving..."><CloudUpload className="h-4 w-4 text-blue-500 animate-pulse" /></span>
        ) : saveStatus === 'dirty' ? (
          <span title="Unsaved changes"><CloudUpload className="h-4 w-4 text-yellow-500" /></span>
        ) : (
          <span title="Saved"><Cloud className="h-4 w-4 text-green-500" /></span>
        )}
      </div>
    );
  };

  const isMainBranch = currentBranch === 'main';

  // Load conflict files when thread is resolving
  useEffect(() => {
    if (isResolving && currentThread?.id && userId) {
      const loadConflictFiles = async () => {
        try {
          setConflictLoading(true);
          const response = await ThreadsAPI.getThreadFiles(currentThread.id, userId);
          setConflictFiles(response.files);
        } catch (err) {
          console.error('Failed to load conflict files:', err);
        } finally {
          setConflictLoading(false);
        }
      };

      loadConflictFiles();
      // Poll for updates while resolving
      const interval = setInterval(loadConflictFiles, 2000);
      return () => clearInterval(interval);
    } else {
      setConflictFiles([]);
    }
  }, [isResolving, currentThread?.id, userId, pageUpdateCounter]);

  // Reset revision view when page changes
  useEffect(() => {
    if (currentPage) {
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

  // Track current editing page to properly clean up on page change
  const editingPageRef = useRef<string | null>(null);

  // Update editing state for merge blocking when switching tabs or pages
  useEffect(() => {
    // Only manage editing state when on main branch
    if (!currentPage || !userId || !isMainBranch) return;

    const isEditing = mainTab === 'edit';
    const currentPath = currentPage.path;

    if (isEditing) {
      // If we were editing a different page, clear that first
      if (editingPageRef.current && editingPageRef.current !== currentPath) {
        setEditingState(editingPageRef.current, userId, false);
      }
      // Set editing state for current page
      setEditingState(currentPath, userId, true);
      editingPageRef.current = currentPath;
    } else {
      // Switched to view mode - clear editing state
      if (editingPageRef.current) {
        setEditingState(editingPageRef.current, userId, false);
        editingPageRef.current = null;
      }
    }
  }, [mainTab, currentPage?.path, userId, isMainBranch]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (editingPageRef.current && userId) {
        setEditingState(editingPageRef.current, userId, false);
      }
    };
  }, [userId]);

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
          `${getApiUrl()}/api/pages/${encodeURIComponent(currentPage.path)}/at-ref?ref=${revision.sha}`
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
    setBranchViewMode(value as 'preview' | 'diff' | 'history');
  };

  // Title editing handlers
  const startEditingTitle = useCallback(() => {
    if (!currentPage) return;
    // Show full filename with extension
    setTitleInput(currentPage.title);
    setIsEditingTitle(true);
    // Focus input after render
    setTimeout(() => titleInputRef.current?.focus(), 0);
  }, [currentPage]);

  const cancelEditingTitle = useCallback(() => {
    setIsEditingTitle(false);
    setTitleInput('');
  }, []);

  const saveTitle = useCallback(async () => {
    if (!currentPage || !titleInput.trim()) {
      cancelEditingTitle();
      return;
    }

    const newName = titleInput.trim();

    // No change - just cancel
    if (newName === currentPage.title) {
      cancelEditingTitle();
      return;
    }

    try {
      setTitleSaving(true);
      titleSavingRef.current = true;
      const response = await fetch(
        `${getApiUrl()}/api/pages/${encodeURIComponent(currentPage.path)}/rename`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_name: newName }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to rename page');
      }

      const renamedPage = await response.json();

      // Reload page tree to reflect the change
      await actions.loadPageTree();

      // Set the renamed page directly (no re-fetch needed)
      actions.setCurrentPageDirect(renamedPage);

      setIsEditingTitle(false);
      setTitleInput('');
    } catch (err) {
      console.error('Failed to rename page:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to rename page');
    } finally {
      setTitleSaving(false);
      titleSavingRef.current = false;
    }
  }, [currentPage, titleInput, actions, cancelEditingTitle]);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitle();
    } else if (e.key === 'Escape') {
      cancelEditingTitle();
    }
  }, [saveTitle, cancelEditingTitle]);

  // Reset title editing when page changes
  useEffect(() => {
    setIsEditingTitle(false);
    setTitleInput('');
  }, [currentPage?.path]);

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
      <div
        className="h-full bg-background flex flex-col"
        data-selection-area="center-panel"
      >
        <SelectionFloatingButton />
        {/* Header */}
        <div className="border-b border-border p-4 flex items-center justify-between">
          <div className="group flex items-center gap-2">
            {isEditingTitle ? (
              <>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  onKeyDown={handleTitleKeyDown}
                  onBlur={() => {
                    // Delay to allow button clicks to register
                    setTimeout(() => {
                      // Only auto-save if not already saving (use ref to avoid closure issues)
                      if (!titleSavingRef.current) saveTitle();
                    }, 150);
                  }}
                  disabled={titleSaving}
                  className="text-2xl font-bold text-foreground bg-transparent border-none focus:outline-none focus:ring-0 p-0 m-0 min-w-[120px]"
                  style={{ width: `${Math.max(titleInput.length + 2, 8)}ch` }}
                  placeholder="name"
                />
                {titleSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </>
            ) : (
              <>
                <h1
                  className="text-2xl font-bold text-foreground cursor-pointer hover:text-foreground/80 transition-colors"
                  onClick={startEditingTitle}
                >
                  <FileName path={currentPage.path} />
                </h1>
                <Pencil
                  className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:text-foreground"
                  onClick={startEditingTitle}
                />
              </>
            )}
          </div>
          {/* Show collab status in View and Edit modes (not for images) */}
          {fileType !== 'image' && (mainTab === 'view' || mainTab === 'edit') && <CollabStatusBar />}
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
                <TabsTrigger value="view">
                  <Eye className="h-4 w-4 mr-1.5" />
                  View
                </TabsTrigger>
                {fileType !== 'image' && (
                  <TabsTrigger value="edit">
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Edit
                  </TabsTrigger>
                )}
                <TabsTrigger value="history">
                  <History className="h-4 w-4 mr-1.5" />
                  History
                </TabsTrigger>
              </TabsList>

              {/* Format toggle for View and Edit tabs (not for images) */}
              {fileType !== 'image' && (mainTab === 'view' || mainTab === 'edit') && (
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

            {/* File-type aware editor rendering for View and Edit modes */}
            {(mainTab === 'view' || mainTab === 'edit') && !viewingRevision && (
              <div className="flex-1 overflow-hidden mt-0 flex flex-col">
                <div className="flex-1 overflow-auto min-h-0">
                  {/* Typed data view: render with view template */}
                  {viewTemplate && mainTab === 'view' ? (
                    <div className="h-full p-4">
                      <ViewRuntime
                        key={`view-${viewTemplate.path}-${currentPage.path}`}
                        tsxCode={viewTemplate.content}
                        pagePath={viewTemplate.path}
                        viewProps={{ pagePath: currentPage.path }}
                        onCollabStatusChange={handleCollabStatusChange}
                      />
                    </div>
                  ) : viewTemplateLoading && mainTab === 'view' ? (
                    /* Loading view template */
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : fileType === 'csv' ? (
                    /* CSV: Table editor */
                    <CSVEditor
                      key={`csv-${currentPage.path}`}
                      pagePath={currentPage.path}
                      initialHeaders={currentPage.headers}
                      editable={mainTab === 'edit'}
                      className="h-full p-4"
                    />
                  ) : fileType === 'tsx' ? (
                    /* TSX: View templates show info in View mode, regular TSX renders */
                    mainTab === 'edit' ? (
                      <CollaborativeCodeMirrorEditor
                        key={`collab-cm-${currentPage.path}`}
                        pagePath={currentPage.path}
                        pageTitle={currentPage.title}
                        initialContent={currentPage.content || ''}
                        editable={true}
                        onCollabStatusChange={handleCollabStatusChange}
                        className="h-full"
                      />
                    ) : isViewTemplate ? (
                      <ViewTemplateInfo path={currentPage.path} />
                    ) : (
                      <div className="h-full p-4">
                        <ViewRuntime
                          tsxCode={currentPage.content || ''}
                          pagePath={currentPage.path}
                          onCollabStatusChange={handleCollabStatusChange}
                        />
                      </div>
                    )
                  ) : fileType === 'image' ? (
                    /* Image: Display image */
                    <div className="h-full flex items-center justify-center p-8">
                      <img
                        src={`${getApiUrl()}/api/assets/${currentPage.path}`}
                        alt={currentPage.title}
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  ) : fileType === 'unknown' ? (
                    /* Unknown file type: edit as text, view shows message or raw */
                    mainTab === 'edit' ? (
                      <CollaborativeCodeMirrorEditor
                        key={`collab-cm-${currentPage.path}`}
                        pagePath={currentPage.path}
                        pageTitle={currentPage.title}
                        initialContent={currentPage.content || ''}
                        editable={true}
                        onCollabStatusChange={handleCollabStatusChange}
                        className="h-full"
                      />
                    ) : (
                      <CollaborativeCodeMirrorEditor
                        key={`collab-cm-view-${currentPage.path}`}
                        pagePath={currentPage.path}
                        pageTitle={currentPage.title}
                        initialContent={currentPage.content || ''}
                        editable={false}
                        onCollabStatusChange={handleCollabStatusChange}
                        className="h-full"
                      />
                    )
                  ) : (
                    /* Markdown: Formatted or raw mode */
                    formatMode === 'raw' ? (
                      <CollaborativeCodeMirrorEditor
                        key={`collab-cm-${currentPage.path}-${pageUpdateCounter}`}
                        pagePath={currentPage.path}
                        pageTitle={currentPage.title}
                        initialContent={currentPage.content || ''}
                        editable={mainTab === 'edit'}
                        onCollabStatusChange={handleCollabStatusChange}
                        className="h-full"
                      />
                    ) : (
                      <CollaborativeEditor
                        key={`collab-${currentPage.path}-${pageUpdateCounter}`}
                        pagePath={currentPage.path}
                        pageTitle={currentPage.title}
                        initialContent={currentPage.content || ''}
                        editable={mainTab === 'edit'}
                        onCollabStatusChange={handleCollabStatusChange}
                        onLinkClick={handleWikiLinkClick}
                        className="h-full"
                      />
                    )
                  )}
                </div>
              </div>
            )}

            {/* Historical revision viewer - non-collaborative */}
            {mainTab === 'view' && viewingRevision && (
              <div className="flex-1 overflow-hidden mt-0 flex flex-col">
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
                <div className="flex-1 overflow-auto min-h-0">
                  {viewingRevisionContent === null ? (
                    <div className="p-4 text-muted-foreground">Loading revision...</div>
                  ) : formatMode === 'raw' ? (
                    <CodeMirrorEditor
                      content={viewingRevisionContent ?? ''}
                      editable={false}
                      className="h-full"
                    />
                  ) : (
                    <ProseMirrorEditor
                      key={`view-${currentPage.title}-${viewingRevision.sha}`}
                      initialContent={viewingRevisionContent ?? ''}
                      editable={false}
                      onLinkClick={handleWikiLinkClick}
                      className="h-full"
                      pagePath={currentPage.path}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Hidden TabsContent for View/Edit - needed for Radix Tabs structure */}
            <TabsContent value="view" className="hidden" />
            <TabsContent value="edit" className="hidden" />

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
    <div
      className="h-full bg-background flex flex-col"
      data-selection-area="center-panel"
    >
      <SelectionFloatingButton />
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">
            <FileName path={currentPage.path} />
          </h1>
        </div>
      </div>

      {/* Content Area with Tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs
          value={branchViewMode}
          onValueChange={handleBranchTabChange}
          className="h-full flex flex-col"
        >
          <div className="flex items-center justify-between mx-4 mt-4">
            <TabsList>
              <TabsTrigger value="preview">
                <Eye className="h-4 w-4 mr-1.5" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="diff">
                <GitBranch className="h-4 w-4 mr-1.5" />
                Diff
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-1.5" />
                History
              </TabsTrigger>
            </TabsList>

            {/* Branch indicator or resolving indicator */}
            {isResolving ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                  Resolving Merge Conflicts
                </span>
                {conflictLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <GitBranch className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-blue-600 dark:text-blue-400">
                  <code className="font-mono">{currentBranch}</code> vs main
                </span>
              </div>
            )}
          </div>

          {/* Preview tab - read-only view of branch content */}
          <TabsContent value="preview" className="flex-1 overflow-hidden mt-0 flex flex-col">
            <div className="flex-1 overflow-auto min-h-0">
              <BranchProvider branch={currentBranch} ephemeral>
                {fileType === 'csv' ? (
                  <CSVEditor
                    key={`csv-view-${currentPage.path}-${currentBranch}-${pageUpdateCounter}`}
                    pagePath={currentPage.path}
                    initialHeaders={currentPage.headers}
                    editable={false}
                    className="h-full p-4"
                  />
                ) : fileType === 'tsx' ? (
                  /* View templates show info, regular TSX renders as view */
                  isViewTemplate ? (
                    <ViewTemplateInfo path={currentPage.path} />
                  ) : (
                    <div className="h-full p-4">
                      <ViewRuntime
                        key={`tsx-view-${currentPage.path}-${currentBranch}-${pageUpdateCounter}`}
                        tsxCode={currentPage.content || ''}
                        pagePath={currentPage.path}
                        branchRef={currentBranch}
                      />
                    </div>
                  )
                ) : fileType === 'image' ? (
                  <div className="h-full flex items-center justify-center p-8">
                    <img
                      src={`${getApiUrl()}/api/assets/${currentPage.path}`}
                      alt={currentPage.title}
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                ) : fileType === 'unknown' ? (
                  /* Unknown file type: show as raw text */
                  <CodeMirrorEditor
                    key={`cm-view-${currentPage.path}-${currentBranch}-${pageUpdateCounter}`}
                    content={currentPage.content || ''}
                    editable={false}
                    className="h-full"
                  />
                ) : (
                  <div className="h-full p-4">
                    <ProseMirrorEditor
                      key={`md-view-${currentPage.path}-${currentBranch}-${pageUpdateCounter}`}
                      initialContent={currentPage.content || ''}
                      editable={false}
                      onLinkClick={handleWikiLinkClick}
                      className="h-full"
                      pagePath={currentPage.path}
                    />
                  </div>
                )}
              </BranchProvider>
            </div>
          </TabsContent>

          <TabsContent value="diff" className="flex-1 overflow-hidden mt-0 flex flex-col">
            <div className="flex-1 overflow-auto min-h-0">
              {isResolving ? (
                // Conflict resolution view - same style as diff view
                <div className="h-full p-4">
                  {conflictFiles.length === 0 ? (
                    <div className="text-muted-foreground">
                      {conflictLoading ? 'Loading files...' : 'No files found'}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {conflictFiles.map((file) => (
                        <div key={file.path} className="border rounded-lg overflow-hidden bg-background">
                          {/* File header - same style as diff */}
                          <div className={`flex items-center gap-2 px-4 py-2 text-sm font-mono border-b ${
                            file.has_conflicts
                              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                              : 'bg-muted/50'
                          }`}>
                            {file.has_conflicts && <AlertTriangle className="h-4 w-4" />}
                            <span className="font-medium">{file.path}</span>
                            {file.has_conflicts && (
                              <span className="ml-auto text-xs uppercase font-semibold">
                                Has Conflicts
                              </span>
                            )}
                          </div>

                          {/* File content - CodeMirror-like styling */}
                          <div className="font-mono text-sm overflow-x-auto">
                            {file.content.split('\n').map((line, i) => {
                              const isConflictStart = line.startsWith('<<<<<<<');
                              const isConflictSep = line.startsWith('=======');
                              const isConflictEnd = line.startsWith('>>>>>>>');

                              let bgClass = '';
                              let textClass = '';
                              if (isConflictStart) {
                                bgClass = 'bg-red-500/20';
                                textClass = 'text-red-600 dark:text-red-400 font-bold';
                              } else if (isConflictSep) {
                                bgClass = 'bg-yellow-500/20';
                                textClass = 'text-yellow-600 dark:text-yellow-400 font-bold';
                              } else if (isConflictEnd) {
                                bgClass = 'bg-green-500/20';
                                textClass = 'text-green-600 dark:text-green-400 font-bold';
                              }

                              return (
                                <div
                                  key={i}
                                  className={`flex ${bgClass}`}
                                >
                                  <span className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r bg-muted/30 flex-shrink-0">
                                    {i + 1}
                                  </span>
                                  <pre className={`px-4 py-0.5 whitespace-pre flex-1 ${textClass}`}>
                                    {line || ' '}
                                  </pre>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <CodeMirrorDiffView
                  pagePath={currentPage.path}
                  branchName={currentBranch}
                  refreshTrigger={pageUpdateCounter}
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
};

export default CenterPanel;
