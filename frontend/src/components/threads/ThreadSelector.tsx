/**
 * ThreadSelector - dropdown to select between User Assistant and active threads
 */
import React, { useMemo, useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { GitBranch, MessageCircle, Plus } from "lucide-react";
import type { Thread } from "../../types/thread";
import { stringToColor, getInitials } from "../../utils/colors";
import { useAuth } from "../../contexts/AuthContext";
import { PinBadge, TotalPinBadge } from "./PinBadge";
import { ThreadsAPI } from "../../services/threads-api";
import { useAppContext } from "../../contexts/AppContext";
import { GitAPI } from "../../services/git-api";

interface DiffStats {
  additions: number;
  deletions: number;
}

interface ThreadSelectorProps {
  threads: Thread[];
  selectedThreadId: string | null;
  assistantThreadId: string | null;  // ID of the assistant thread
  onSelect: (threadId: string | null) => void;
  disabled?: boolean;
}

export function ThreadSelector({
  threads,
  selectedThreadId,
  assistantThreadId,
  onSelect,
  disabled,
}: ThreadSelectorProps) {
  const { userId, user } = useAuth();
  const { websocket, state, actions } = useAppContext();
  const { pageUpdateCounter, isCreatingThread } = state;

  // Control dropdown open state
  const [isOpen, setIsOpen] = useState(false);

  // Diff stats per thread (keyed by thread id)
  const [diffStats, setDiffStats] = useState<Record<string, DiffStats>>({});

  // Fetch diff stats for all threads with branches
  useEffect(() => {
    const fetchStats = async () => {
      const stats: Record<string, DiffStats> = {};

      for (const thread of threads) {
        if (thread.branch) {
          try {
            const pageStats = await GitAPI.getDiffStatsByPage('main', thread.branch);
            // Sum up all file stats
            let additions = 0;
            let deletions = 0;
            Object.values(pageStats).forEach(s => {
              additions += s.additions;
              deletions += s.deletions;
            });
            stats[thread.id] = { additions, deletions };
          } catch {
            // Ignore errors for individual threads
          }
        }
      }

      setDiffStats(stats);
    };

    fetchStats();
  }, [threads, pageUpdateCounter]);

  // Current user circle info
  const currentUserColor = userId ? stringToColor(userId) : '#888';
  const currentUserInitials = userId ? getInitials(userId, user?.name) : '?';

  // Check if we're in assistant mode (selectedThreadId matches assistantThreadId)
  const isAssistantMode = selectedThreadId === assistantThreadId;

  const selectedThread = selectedThreadId && !isAssistantMode
    ? threads.find((t) => t.id === selectedThreadId)
    : null;

  // Calculate pinned count
  const pinnedCount = useMemo(() => {
    return threads.filter(t => t.is_pinned).length;
  }, [threads]);

  const handleValueChange = (value: string) => {
    // When selecting "assistant", pass null to trigger switching to assistant
    onSelect(value === "assistant" ? null : value);
  };

  // Pin/unpin handlers
  const handlePin = async (threadId: string) => {
    try {
      await ThreadsAPI.pinThread(threadId);
      // Request fresh thread list to update UI
      websocket.sendMessage({ type: 'get_thread_list' });
    } catch (error) {
      console.error('Failed to pin thread:', error);
    }
  };

  const handleUnpin = async (threadId: string) => {
    try {
      await ThreadsAPI.unpinThread(threadId);
      // Request fresh thread list to update UI
      websocket.sendMessage({ type: 'get_thread_list' });
    } catch (error) {
      console.error('Failed to unpin thread:', error);
    }
  };

  // Wrapper to stop event propagation for pin badge (no preventDefault to allow click)
  const stopPropagation = (e: React.MouseEvent | React.PointerEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  // Close dropdown when creating thread
  useEffect(() => {
    if (isCreatingThread) {
      setIsOpen(false);
    }
  }, [isCreatingThread]);

  // Create new thread handler
  const handleCreateNewThread = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);  // Close dropdown immediately
    actions.setCreatingThread(true);
    websocket.sendMessage({
      type: 'spawn_collaborative_thread',
      name: 'new-thread',
      goal: 'This is a new thread. Please describe what you want to work on. The agent will rename this thread once the goal is clear.'
    });
  };

  // Start fresh handler - reset assistant chat
  const handleStartFresh = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);  // Close dropdown
    // Select assistant if not already selected
    if (!isAssistantMode) {
      onSelect(null);
    }
    // Reset the chat (same as /new command)
    websocket.sendMessage({ type: 'reset' });
  };

  return (
    <div className={`flex items-center gap-2 w-full ${isCreatingThread ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Pinned count badge - before dropdown */}
      {pinnedCount > 0 && <TotalPinBadge count={pinnedCount} />}

      <Select
        value={isAssistantMode ? "assistant" : (selectedThreadId || "assistant")}
        onValueChange={handleValueChange}
        disabled={disabled || isCreatingThread}
        open={isOpen}
        onOpenChange={setIsOpen}
      >
        <SelectTrigger className="flex-1 h-auto py-2 group/item">
          <div className="flex items-center gap-2 w-full pr-2">
            {selectedThread && selectedThread.type !== 'assistant' ? (
              <div className="flex items-center gap-2 w-full">
                {/* Pin badge */}
                <div
                  onClick={stopPropagation}
                  onPointerDown={stopPropagation}
                  onPointerUp={stopPropagation}
                  onMouseDown={stopPropagation}
                  onMouseUp={stopPropagation}
                >
                  <PinBadge
                    isPinned={selectedThread.is_pinned || false}
                    onPin={() => handlePin(selectedThread.id)}
                    onUnpin={() => handleUnpin(selectedThread.id)}
                    showOnHover={false}
                  />
                </div>
                {/* Left: Name + Branch (two rows) */}
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="font-medium truncate text-left">
                    {selectedThread.name}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    <span className="font-mono">thread/{selectedThread.name}</span>
                    {diffStats[selectedThread.id] && (
                      <>
                        <span className="text-green-600">+{diffStats[selectedThread.id].additions}</span>
                        <span className="text-red-600">-{diffStats[selectedThread.id].deletions}</span>
                      </>
                    )}
                  </div>
                </div>
                {/* Right: Status + Users (stacked, centered) */}
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  {selectedThread.status && selectedThread.status !== 'Just created' && (
                    <span className="text-xs text-muted-foreground">
                      {selectedThread.status}
                    </span>
                  )}
                  {selectedThread.participants && selectedThread.participants.length > 0 && (
                    <div className="flex -space-x-1.5">
                      {selectedThread.participants.slice(0, 3).map((p) => (
                        <div
                          key={p}
                          className="w-5 h-5 rounded-full border border-background flex items-center justify-center text-[9px] font-medium text-white shadow-sm"
                          style={{ backgroundColor: stringToColor(p) }}
                          title={p}
                        >
                          {getInitials(p)}
                        </div>
                      ))}
                      {selectedThread.participants.length > 3 && (
                        <div className="w-5 h-5 rounded-full border border-background bg-muted flex items-center justify-center text-[9px] font-medium shadow-sm">
                          +{selectedThread.participants.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 w-full">
                <MessageCircle className="h-4 w-4" />
                {/* Left: Name + Branch (two rows) */}
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="font-medium text-left">Chat with assistant</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    <span className="font-mono">main</span>
                  </div>
                </div>
                {/* Right: User circle */}
                <div
                  className="w-5 h-5 rounded-full border border-background flex items-center justify-center text-[9px] font-medium text-white shadow-sm flex-shrink-0"
                  style={{ backgroundColor: currentUserColor }}
                  title="You"
                >
                  {currentUserInitials}
                </div>
                {/* Start /new button */}
                <div
                  onClick={handleStartFresh}
                  onPointerDown={stopPropagation}
                  onMouseDown={stopPropagation}
                  className="px-2 py-1.5 text-xs bg-muted text-muted-foreground hover:bg-muted/80 rounded cursor-pointer flex-shrink-0 self-stretch flex items-center"
                >
                  Start /new
                </div>
              </div>
            )}
          </div>
        </SelectTrigger>

      <SelectContent className="bg-background">
        {/* User assistant option (always first) */}
        <SelectItem value="assistant" className="[&>span:last-child]:w-full">
          <div className="flex items-center gap-2 w-full">
            <MessageCircle className="h-4 w-4" />
            {/* Left: Name + Branch (two rows) */}
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="font-medium">Chat with assistant</span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span className="font-mono">main</span>
              </div>
            </div>
            {/* Right: User circle */}
            <div
              className="w-5 h-5 rounded-full border border-background flex items-center justify-center text-[9px] font-medium text-white shadow-sm flex-shrink-0"
              style={{ backgroundColor: currentUserColor }}
              title="You"
            >
              {currentUserInitials}
            </div>
            {/* Start /new button */}
            <div
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStartFresh(e); }}
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseUp={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className="px-2 py-1.5 text-xs bg-muted text-muted-foreground hover:bg-muted/80 rounded cursor-pointer flex-shrink-0 self-stretch flex items-center"
            >
              Start /new
            </div>
          </div>
        </SelectItem>

        {/* Separator before create button */}
        <div className="border-t my-1" />

        {/* Create new thread button */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent cursor-pointer rounded-sm"
          onClick={handleCreateNewThread}
        >
          <Plus className="h-4 w-4" />
          <span className="font-medium">Create new thread</span>
        </div>

        {/* Separator if threads exist */}
        {threads.length > 0 && <div className="border-t my-1" />}

        {/* All threads sorted by name */}
        {threads
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((thread) => (
            <SelectItem key={thread.id} value={thread.id} className="[&>span:last-child]:w-full group/item">
              <div className="flex items-center gap-2 w-full">
                {/* Pin badge */}
                <div
                  onClick={stopPropagation}
                  onPointerDown={stopPropagation}
                  onPointerUp={stopPropagation}
                  onMouseDown={stopPropagation}
                  onMouseUp={stopPropagation}
                >
                  <PinBadge
                    isPinned={thread.is_pinned || false}
                    onPin={() => handlePin(thread.id)}
                    onUnpin={() => handleUnpin(thread.id)}
                  />
                </div>
                {/* Left: Name + Branch (two rows) */}
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="font-medium truncate">{thread.name}</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    <span className="font-mono">thread/{thread.name}</span>
                    {diffStats[thread.id] && (
                      <>
                        <span className="text-green-600">+{diffStats[thread.id].additions}</span>
                        <span className="text-red-600">-{diffStats[thread.id].deletions}</span>
                      </>
                    )}
                  </div>
                </div>
                {/* Right: Status + Users (stacked, centered) */}
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  {thread.status && thread.status !== 'Just created' && (
                    <span className="text-xs text-muted-foreground">
                      {thread.status}
                    </span>
                  )}
                  {thread.participants && thread.participants.length > 0 && (
                    <div className="flex -space-x-1.5">
                      {thread.participants.slice(0, 3).map((p) => (
                        <div
                          key={p}
                          className="w-5 h-5 rounded-full border border-background flex items-center justify-center text-[9px] font-medium text-white shadow-sm"
                          style={{ backgroundColor: stringToColor(p) }}
                          title={p}
                        >
                          {getInitials(p)}
                        </div>
                      ))}
                      {thread.participants.length > 3 && (
                        <div className="w-5 h-5 rounded-full border border-background bg-muted flex items-center justify-center text-[9px] font-medium shadow-sm">
                          +{thread.participants.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </SelectItem>
          ))}

        {/* Empty state */}
        {threads.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No active threads
          </div>
        )}
      </SelectContent>
      </Select>
    </div>
  );
}

export default ThreadSelector;
