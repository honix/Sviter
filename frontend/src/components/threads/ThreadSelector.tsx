/**
 * ThreadSelector - dropdown to select between User Assistant and active threads
 */
import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { GitBranch, MessageCircle } from "lucide-react";
import type { Thread, ThreadStatus } from "../../types/thread";
import { stringToColor, getInitials } from "../../utils/colors";
import { useAuth } from "../../contexts/AuthContext";

interface ThreadSelectorProps {
  threads: Thread[];
  selectedThreadId: string | null;
  assistantThreadId: string | null;  // ID of the assistant thread
  onSelect: (threadId: string | null) => void;
  disabled?: boolean;
}

// Thread icon - git branch since threads work on branches
const ThreadIcon: React.FC = () => (
  <GitBranch className="h-3 w-3 text-muted-foreground" />
);

export function ThreadSelector({
  threads,
  selectedThreadId,
  assistantThreadId,
  onSelect,
  disabled,
}: ThreadSelectorProps) {
  const { userId, user } = useAuth();

  // Current user circle info
  const currentUserColor = userId ? stringToColor(userId) : '#888';
  const currentUserInitials = userId ? getInitials(userId, user?.name) : '?';

  // Check if we're in assistant mode (selectedThreadId matches assistantThreadId)
  const isAssistantMode = selectedThreadId === assistantThreadId;

  const selectedThread = selectedThreadId && !isAssistantMode
    ? threads.find((t) => t.id === selectedThreadId)
    : null;

  const handleValueChange = (value: string) => {
    // When selecting "assistant", pass null to trigger switching to assistant
    onSelect(value === "assistant" ? null : value);
  };

  return (
    <Select
      value={isAssistantMode ? "assistant" : (selectedThreadId || "assistant")}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full h-auto py-2">
        <div className="flex items-center gap-2 w-full">
          {selectedThread && selectedThread.type !== 'assistant' ? (
            <>
              <ThreadIcon />
              <span className="font-medium truncate flex-1 min-w-0 text-left">
                {selectedThread.name}
              </span>

              {/* Attention indicator */}
              {selectedThread.needs_attention && (
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
              )}

              {/* Status */}
              {selectedThread.status && selectedThread.status !== 'Just created' && (
                <span className="text-muted-foreground">
                  {selectedThread.status}
                </span>
              )}

              {/* Participant circles - matches CenterPanel style */}
              {selectedThread.participants && selectedThread.participants.length > 0 && (
                <div className="flex -space-x-1.5 flex-shrink-0 mr-1">
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
            </>
          ) : (
            <>
              <MessageCircle className="h-4 w-4" />
              <span className="font-medium flex-1 text-left">Chat with assistant</span>
              <div
                className="w-5 h-5 rounded-full border border-background flex items-center justify-center text-[9px] font-medium text-white shadow-sm flex-shrink-0 mr-1"
                style={{ backgroundColor: currentUserColor }}
                title="You"
              >
                {currentUserInitials}
              </div>
            </>
          )}
        </div>
      </SelectTrigger>

      <SelectContent className="bg-background">
        {/* User assistant option (always first) */}
        <SelectItem value="assistant" className="[&>span:last-child]:w-full">
          <div className="flex items-center gap-2 w-full">
            <MessageCircle className="h-4 w-4" />
            <span className="flex-1">Chat with assistant</span>
            <div
              className="w-5 h-5 rounded-full border border-background flex items-center justify-center text-[9px] font-medium text-white shadow-sm flex-shrink-0 mr-1"
              style={{ backgroundColor: currentUserColor }}
              title="You"
            >
              {currentUserInitials}
            </div>
          </div>
        </SelectItem>

        {/* Separator if threads exist */}
        {threads.length > 0 && <div className="border-t my-1" />}

        {/* All threads sorted by name */}
        {threads
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((thread) => (
            <SelectItem key={thread.id} value={thread.id} className="[&>span:last-child]:w-full">
              <div className="flex items-center gap-2 w-full">
                <ThreadIcon />
                <span className="truncate flex-1 min-w-0">{thread.name}</span>

                {/* Attention indicator */}
                {thread.needs_attention && (
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                )}

                {/* Status */}
                {thread.status && thread.status !== 'Just created' && (
                  <span className="text-muted-foreground">
                    {thread.status}
                  </span>
                )}

                {/* Participant circles - matches CenterPanel style */}
                {thread.participants && thread.participants.length > 0 && (
                  <div className="flex -space-x-1.5 flex-shrink-0 mr-1">
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
  );
}

export default ThreadSelector;
