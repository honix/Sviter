import React from 'react';
import ChatInterface from '../chat/ChatInterface';
import { AgentPanel } from '../agents/AgentPanel';
import { useAppContext } from '../../contexts/AppContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const RightPanel: React.FC = () => {
  const { state, actions } = useAppContext();

  return (
    <div className="h-full flex flex-col bg-background">
      <Tabs
        value={state.rightPanelMode}
        onValueChange={(value) => actions.setRightPanelMode(value as 'chat' | 'agents')}
        className="h-full flex flex-col"
      >
        <TabsList className="w-full grid grid-cols-2 rounded-none border-b flex-shrink-0">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 m-0 min-h-0">
          <ChatInterface />
        </TabsContent>

        <TabsContent value="agents" className="flex-1 m-0 min-h-0">
          <AgentPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RightPanel;