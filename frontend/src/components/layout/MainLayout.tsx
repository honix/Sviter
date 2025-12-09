import React from 'react';
import LeftPanel from './LeftPanel';
import CenterPanel from './CenterPanel';
import RightPanel from './RightPanel';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';

const MainLayout: React.FC = () => {
  // Enable keyboard shortcuts
  useKeyboardShortcuts();

  return (
    <div className="h-screen bg-background overflow-hidden relative">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left Panel - Page Tree */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <LeftPanel />
        </ResizablePanel>

        <ResizableHandle />

        {/* Center Panel - Page Content */}
        <ResizablePanel defaultSize={40} minSize={30}>
          <CenterPanel />
        </ResizablePanel>

        <ResizableHandle />

        {/* Right Panel - AI Chat */}
        <ResizablePanel defaultSize={40} minSize={20} maxSize={40}>
          <RightPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default MainLayout;