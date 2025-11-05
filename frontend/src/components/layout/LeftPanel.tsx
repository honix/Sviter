import React from 'react';
import PageTree from '../pages/PageTree';
import { useAppContext } from '../../contexts/AppContext';

const LeftPanel: React.FC = () => {
  const { state, actions } = useAppContext();
  const { pages, currentPage } = state;
  const { setCurrentPage, createPage, deletePage } = actions;

  // Convert pages to page tree items
  const pageTree = pages.map(page => ({
    title: page.title,
    path: page.path
  }));

  return (
    <PageTree
      items={pageTree}
      currentPage={currentPage}
      onPageSelect={setCurrentPage}
      onCreatePage={createPage}
      onDeletePage={deletePage}
      pages={pages}
    />
  );
};

export default LeftPanel;