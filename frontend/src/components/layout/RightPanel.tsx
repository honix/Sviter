import React from 'react';
import ChatInterface from '../chat/ChatInterface';
import { ThreadSelector } from '../threads/ThreadSelector';
import { useAppContext } from '../../contexts/AppContext';

const RightPanel: React.FC = () => {
  const { state, actions } = useAppContext();
  const { threads, selectedThreadId, assistantThreadId, connectionStatus } = state;

  const isConnected = connectionStatus === 'connected';

  // Get worker thread metadata if a worker thread is selected
  const selectedThread = selectedThreadId && selectedThreadId !== assistantThreadId
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

      {/* Chat Interface - only render when we have a valid threadId */}
      <div className="flex-1 min-h-0">
        {selectedThreadId ? (
          <ChatInterface
            threadId={selectedThreadId}
            thread={selectedThread}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Connecting...
          </div>
        )}
      </div>
    </div>
  );
};

export default RightPanel;
