/**
 * Agent Panel - displays agent list and controls in right panel
 */
import React, { useState, useEffect } from 'react';
import { AgentsAPI } from '../../services/agents-api';
import { useAppContext } from '../../contexts/AppContext';
import type { Agent, PullRequest, AgentExecutionResult } from '../../types/agent';

export function AgentPanel() {
  const { actions } = useAppContext();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pendingPRs, setPendingPRs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<AgentExecutionResult | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [agentsData, pendingData] = await Promise.all([
        AgentsAPI.listAgents(),
        AgentsAPI.getPendingPRs(),
      ]);

      setAgents(agentsData);
      setPendingPRs(pendingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleRunAgent = async (agentName: string) => {
    try {
      setRunningAgent(agentName);
      setExecutionResult(null);
      setError(null);

      const result = await AgentsAPI.runAgent(agentName);
      setExecutionResult(result);

      // Reload PRs to show newly created PR
      const pendingData = await AgentsAPI.getPendingPRs();
      setPendingPRs(pendingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run agent');
    } finally {
      setRunningAgent(null);
    }
  };

  const handleViewPR = (branch: string) => {
    actions.viewPR(branch);
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

        {/* Pending PRs */}
        <div>
          <h2 className="text-sm font-semibold mb-3 text-foreground">
            Pending Reviews ({pendingPRs.length})
          </h2>
          {pendingPRs.length === 0 ? (
            <div className="text-muted-foreground text-sm">No pending PRs</div>
          ) : (
            <div className="space-y-2">
              {pendingPRs.map((pr) => (
                <button
                  key={pr.branch}
                  onClick={() => handleViewPR(pr.branch)}
                  className="w-full text-left border border-border rounded-md p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="font-mono text-xs text-muted-foreground mb-1">
                    {pr.agent_name}
                  </div>
                  <div className="text-sm font-medium line-clamp-2">
                    {pr.commit_message.split('\n')[0]}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    {pr.files_changed} file{pr.files_changed !== 1 ? 's' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
