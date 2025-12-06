import React from 'react';
import ChatInterface from '../chat/ChatInterface';
import { ThreadSelector } from '../threads/ThreadSelector';
import { useAppContext } from '../../contexts/AppContext';

const RightPanel: React.FC = () => {
  const { state, actions } = useAppContext();
  const { threads, selectedThreadId, connectionStatus } = state;

  const isConnected = connectionStatus === 'connected';

  // Get current thread if one is selected
  const selectedThread = selectedThreadId
    ? threads.find(t => t.id === selectedThreadId)
    : null;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with Thread Selector */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <ThreadSelector
          threads={threads}
          selectedThreadId={selectedThreadId}
          onSelect={actions.selectThread}
          isConnected={isConnected}
        />
      </div>

      {/* Chat Interface */}
      <div className="flex-1 min-h-0">
        <ChatInterface
          threadId={selectedThreadId}
          thread={selectedThread}
        />
      </div>
    </div>
  );
};

export default RightPanel;
