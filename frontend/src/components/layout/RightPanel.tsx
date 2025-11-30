import React from 'react';
import ChatInterface from '../chat/ChatInterface';
import { AgentSelector } from '../agents/AgentSelector';
import { useAppContext } from '../../contexts/AppContext';
import type { Agent } from '../../types/agent';

const RightPanel: React.FC = () => {
  const { state, actions } = useAppContext();
  const { selectedAgent, isAgentRunning, connectionStatus } = state;

  const handleAgentSelect = (agentName: string, agent: Agent) => {
    actions.selectAgent(agent);
  };

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with Agent Selector */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <AgentSelector
          selectedAgent={selectedAgent?.name || 'ChatAgent'}
          onAgentSelect={handleAgentSelect}
          disabled={isAgentRunning}
          agentInfo={selectedAgent}
          isConnected={isConnected}
        />
      </div>

      {/* Chat Interface */}
      <div className="flex-1 min-h-0">
        <ChatInterface />
      </div>
    </div>
  );
};

export default RightPanel;
