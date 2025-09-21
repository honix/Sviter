import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { parseMarkdown } from '../../utils/markdown';
import LoadingSpinner from '../common/LoadingSpinner';

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
      <div className="h-full bg-white dark:bg-gray-800 flex items-center justify-center">
        <LoadingSpinner size="lg" message="Loading page..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full bg-white dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Error
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!currentPage) {
    return (
      <div className="h-full bg-white dark:bg-gray-800 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No page selected
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Select a page from the left panel or create a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white dark:bg-gray-800 flex flex-col">
      {/* Header with tabs */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {currentPage.title}
        </h1>

        <div className="flex items-center space-x-3">
          {viewMode === 'edit' && (
            <div className="flex space-x-2">
              <button
                onClick={handleSave}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('view')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'view'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              View
            </button>
            <button
              onClick={() => setViewMode('edit')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'edit'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'view' ? (
          <div className="h-full p-6 overflow-y-auto custom-scrollbar">
            <div className="prose dark:prose-invert max-w-none">
              {parseMarkdown(currentPage.content)}
            </div>
          </div>
        ) : (
          <div className="h-full p-4">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-full p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Start writing..."
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CenterPanel;