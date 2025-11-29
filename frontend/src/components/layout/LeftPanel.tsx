import React, { useEffect } from 'react';
import PageTree from '../pages/PageTree';
import { useAppContext } from '../../contexts/AppContext';

const LeftPanel: React.FC = () => {
  const { state, actions } = useAppContext();
  const { pages, currentPage, pageTree, expandedFolders } = state;
  const {
    setCurrentPage,
    createPage,
    deletePage,
    loadPageTree,
    createFolder,
    deleteFolder,
    toggleFolder,
    moveItem
  } = actions;

  // Load page tree on mount
  useEffect(() => {
    loadPageTree();
  }, []);

  return (
    <PageTree
      tree={pageTree}
      pages={pages}
      currentPage={currentPage}
      expandedFolders={expandedFolders}
      onPageSelect={setCurrentPage}
      onCreatePage={createPage}
      onDeletePage={deletePage}
      onCreateFolder={createFolder}
      onDeleteFolder={deleteFolder}
      onToggleFolder={toggleFolder}
      onMoveItem={moveItem}
    />
  );
};

export default LeftPanel;
