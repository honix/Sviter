import React from 'react';
import LeftPanel from './LeftPanel';
import CenterPanel from './CenterPanel';
import RightPanel from './RightPanel';
import ConnectionStatus from './ConnectionStatus';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

const MainLayout: React.FC = () => {
  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden relative">
      {/* Connection Status Indicator */}
      <ConnectionStatus />

      {/* Left Panel - Page Tree */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
        <LeftPanel />
      </div>

      {/* Center Panel - Page Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <CenterPanel />
      </div>

      {/* Right Panel - AI Chat */}
      <div className="w-80 flex-shrink-0 border-l border-gray-200 dark:border-gray-700">
        <RightPanel />
      </div>
    </div>
  );
};

export default MainLayout;