/**
 * Agent Panel - displays agent list and controls in right panel
 */
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { AgentsAPI } from '../../services/agents-api';
import type { Agent, AgentExecutionResult } from '../../types/agent';

export function AgentPanel() {
  const { actions, websocket } = useAppContext();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<AgentExecutionResult | null>(null);

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

  const handleRunAgent = (agentName: string) => {
    try {
      setRunningAgent(agentName);
      setExecutionResult(null);
      setError(null);

      // Find agent to get model
      const agent = agents.find(a => a.name === agentName);

      // Switch to chat tab to view agent execution
      actions.viewAgentExecution(agentName, agent?.model);

      // Run agent via WebSocket for real-time streaming
      websocket.sendMessage({
        type: 'run_agent',
        agent_name: agentName
      });

      // Listen for completion
      const unsubscribe = websocket.onMessage((message) => {
        if (message.type === 'agent_complete') {
          setExecutionResult({
            agent_name: agentName,
            status: message.status,
            stop_reason: message.stop_reason || 'completed',
            iterations: message.iterations,
            branch_created: message.branch_created,
            pages_analyzed: 0,
            execution_time: 0,
            logs: []
          });
          setRunningAgent(null);
          unsubscribe();
        } else if (message.type === 'error') {
          setError(message.message || 'Agent execution failed');
          setRunningAgent(null);
          unsubscribe();
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run agent');
      setRunningAgent(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground text-sm">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Error display */}
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Execution Result */}
        {executionResult && (
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-md">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-sm">Execution Complete</h3>
              <button
                onClick={() => setExecutionResult(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
            <div className="text-xs space-y-1 text-muted-foreground">
              <div>Status: <span className="text-foreground">{executionResult.status}</span></div>
              <div>Iterations: {executionResult.iterations}</div>
              <div>Time: {executionResult.execution_time.toFixed(2)}s</div>
              {executionResult.branch_created && (
                <div className="text-primary font-medium">Branch created!</div>
              )}
            </div>
          </div>
        )}

        {/* Available Agents */}
        <div>
          <h2 className="text-sm font-semibold mb-3 text-foreground">Available Agents</h2>
          {agents.length === 0 ? (
            <div className="text-muted-foreground text-sm">No agents available</div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="border border-border rounded-md p-3 bg-muted/30"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-medium text-sm">{agent.name}</h3>
                      <div className="text-xs text-muted-foreground mt-1">
                        {agent.enabled ? (
                          <span className="text-primary">● Enabled</span>
                        ) : (
                          <span className="text-muted-foreground">○ Disabled</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Model: {agent.model}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRunAgent(agent.name)}
                    disabled={!agent.enabled || runningAgent === agent.name}
                    className="w-full px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:cursor-not-allowed text-primary-foreground rounded text-xs font-medium transition-colors"
                  >
                    {runningAgent === agent.name ? 'Running...' : 'Run Now'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
