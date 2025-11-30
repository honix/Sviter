/**
 * AgentSelector - dropdown to select between ChatAgent (default) and autonomous agents
 */
import React, { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AgentsAPI } from '../../services/agents-api';
import type { Agent } from '../../types/agent';

interface AgentSelectorProps {
  selectedAgent: string;
  onAgentSelect: (agentName: string, agent: Agent) => void;
  disabled?: boolean;
  agentInfo?: Agent | null;
  isConnected?: boolean;
}

export function AgentSelector({ selectedAgent, onAgentSelect, disabled, agentInfo, isConnected }: AgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      setLoading(true);
      setError(null);
      const agentsData = await AgentsAPI.listAgents();
      setAgents(agentsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  // Sort agents: ChatAgent first, then alphabetically
  const sortedAgents = [...agents].sort((a, b) => {
    if (a.name === 'ChatAgent') return -1;
    if (b.name === 'ChatAgent') return 1;
    return a.name.localeCompare(b.name);
  });

  const handleValueChange = (value: string) => {
    const agent = agents.find(a => a.name === value);
    if (agent) {
      onAgentSelect(value, agent);
    }
  };

  if (loading) {
    return (
      <Select disabled>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Loading agents..." />
        </SelectTrigger>
      </Select>
    );
  }

  if (error) {
    return (
      <Select disabled>
        <SelectTrigger className="w-full border-destructive">
          <SelectValue placeholder="Error loading agents" />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select
      value={selectedAgent}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full h-auto py-2">
        <div className="flex items-center gap-2 w-full">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
          <div className="flex flex-col items-start text-left flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-medium">{selectedAgent}</span>
              {agentInfo && (
                <span className="text-muted-foreground">
                  · {agentInfo.human_in_loop ? 'interactive' : 'autonomous'}
                </span>
              )}
            </div>
            {agentInfo && (
              <span className="text-xs text-muted-foreground truncate w-full">{agentInfo.model}</span>
            )}
          </div>
        </div>
      </SelectTrigger>
      <SelectContent className="bg-background">
        {sortedAgents.map((agent) => (
          <SelectItem
            key={agent.name}
            value={agent.name}
            disabled={!agent.enabled}
          >
            <div className="flex items-center gap-2">
              <span>{agent.name}</span>
              {agent.human_in_loop ? (
                <span className="text-xs text-muted-foreground">(interactive)</span>
              ) : (
                <span className="text-xs text-muted-foreground">(autonomous)</span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
