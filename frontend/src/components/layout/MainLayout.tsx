import React from 'react';
import { useNavigate } from 'react-router-dom';
import LeftPanel from './LeftPanel';
import CenterPanel from './CenterPanel';
import RightPanel from './RightPanel';
import ConnectionStatus from './ConnectionStatus';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';

const MainLayout: React.FC = () => {
  // Enable keyboard shortcuts
  useKeyboardShortcuts();
  const navigate = useNavigate();

  return (
    <div className="h-screen bg-background overflow-hidden relative">
      {/* Connection Status Indicator */}
      <ConnectionStatus />

      {/* Agent Dashboard Navigation */}
      <button
        onClick={() => navigate('/agents')}
        className="absolute top-4 right-4 z-50 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg"
        title="Open Agent Dashboard"
      >
        🤖 Agents
      </button>

      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left Panel - Page Tree */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <LeftPanel />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center Panel - Page Content */}
        <ResizablePanel defaultSize={55} minSize={30}>
          <CenterPanel />
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel - AI Chat */}
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <RightPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default MainLayout;