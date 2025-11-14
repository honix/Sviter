/**
 * Agent Dashboard - main view for autonomous agents and PRs
 */
import React, { useState, useEffect } from 'react';
import { AgentsAPI } from '../../services/agents-api';
import { PRCard } from './PRCard';
import type { Agent, PullRequest, AgentExecutionResult } from '../../types/agent';

export function AgentDashboard() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pendingPRs, setPendingPRs] = useState<PullRequest[]>([]);
  const [recentPRs, setRecentPRs] = useState<PullRequest[]>([]);
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

      const [agentsData, pendingData, recentData] = await Promise.all([
        AgentsAPI.listAgents(),
        AgentsAPI.getPendingPRs(),
        AgentsAPI.getRecentPRs(10),
      ]);

      setAgents(agentsData);
      setPendingPRs(pendingData);
      setRecentPRs(recentData);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-y-auto bg-gray-900 text-gray-100">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Agent Dashboard</h1>
          <p className="text-gray-400">
            Autonomous agents that improve the wiki content
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {/* Execution Result */}
        {executionResult && (
          <div className="mb-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg">
            <h3 className="font-semibold mb-2">Agent Execution Result</h3>
            <div className="text-sm space-y-1">
              <div>
                <span className="text-gray-400">Status:</span>{' '}
                <span className={executionResult.status === 'completed' ? 'text-green-400' : 'text-yellow-400'}>
                  {executionResult.status}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Stop Reason:</span> {executionResult.stop_reason}
              </div>
              <div>
                <span className="text-gray-400">Iterations:</span> {executionResult.iterations}
              </div>
              <div>
                <span className="text-gray-400">Pages Analyzed:</span> {executionResult.pages_analyzed}
              </div>
              <div>
                <span className="text-gray-400">Execution Time:</span> {executionResult.execution_time.toFixed(2)}s
              </div>
              {executionResult.branch_created && (
                <div>
                  <span className="text-gray-400">Branch Created:</span>{' '}
                  <span className="font-mono text-green-400">{executionResult.branch_created}</span>
                </div>
              )}
              {executionResult.error && (
                <div className="text-red-400">
                  <span className="text-gray-400">Error:</span> {executionResult.error}
                </div>
              )}
            </div>
            <button
              onClick={() => setExecutionResult(null)}
              className="mt-3 text-sm text-blue-400 hover:text-blue-300"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Available Agents */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Available Agents</h2>
          {agents.length === 0 ? (
            <div className="text-gray-400">No agents available</div>
          ) : (
            <div className="grid gap-4">
              {agents.map((agent) => (
                <div
                  key={agent.name}
                  className="border border-gray-700 rounded-lg p-4 flex justify-between items-center"
                >
                  <div>
                    <h3 className="font-semibold">{agent.name}</h3>
                    <div className="text-sm text-gray-400 mt-1">
                      {agent.enabled ? (
                        <span className="text-green-400">✓ Enabled</span>
                      ) : (
                        <span className="text-gray-500">Disabled</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRunAgent(agent.name)}
                    disabled={!agent.enabled || runningAgent === agent.name}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors"
                  >
                    {runningAgent === agent.name ? 'Running...' : 'Run Now'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending PRs */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">
            Pending Reviews ({pendingPRs.length})
          </h2>
          {pendingPRs.length === 0 ? (
            <div className="text-gray-400">No pending pull requests</div>
          ) : (
            <div className="space-y-4">
              {pendingPRs.map((pr) => (
                <PRCard key={pr.branch} pr={pr} />
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          {recentPRs.length === 0 ? (
            <div className="text-gray-400">No recent activity</div>
          ) : (
            <div className="space-y-3">
              {recentPRs.map((pr) => (
                <div
                  key={pr.branch}
                  className="border border-gray-800 rounded-lg p-3 flex justify-between items-center"
                >
                  <div className="flex-1">
                    <div className="font-mono text-sm text-gray-400">{pr.branch}</div>
                    <div className="text-sm mt-1">
                      {pr.commit_message.split('\n')[0]}
                    </div>
                  </div>
                  <div>
                    {pr.status === 'approved' ? (
                      <span className="px-3 py-1 rounded bg-green-900 text-green-200 text-sm">
                        ✓ Approved
                      </span>
                    ) : pr.status === 'rejected' ? (
                      <span className="px-3 py-1 rounded bg-red-900 text-red-200 text-sm">
                        ✗ Rejected
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
