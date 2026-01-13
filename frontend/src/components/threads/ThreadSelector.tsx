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

// Generate a consistent color from a string (for participant badges)
const stringToColor = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
};

export function ThreadSelector({
  threads,
  selectedThreadId,
  assistantThreadId,
  onSelect,
  disabled,
}: ThreadSelectorProps) {
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
          <div className="flex flex-col items-start text-left flex-1 min-w-0">
            {selectedThread && selectedThread.type !== 'assistant' ? (
              <>
                <div className="flex items-center gap-1.5 w-full">
                  <ThreadIcon />
                  <span className="font-medium truncate flex-1">
                    {selectedThread.name}
                  </span>
                  {selectedThread.needs_attention && (
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  )}
                </div>
                {/* Show status as text if not default */}
                {selectedThread.status && selectedThread.status !== 'Just created' && (
                  <span className="text-[10px] text-muted-foreground mt-0.5 truncate">
                    {selectedThread.status}
                  </span>
                )}
                {/* Show participant badges */}
                {selectedThread.participants && selectedThread.participants.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {selectedThread.participants.slice(0, 3).map((participant) => (
                      <span
                        key={participant}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-white/90"
                        style={{ backgroundColor: stringToColor(participant) }}
                      >
                        {participant}
                      </span>
                    ))}
                    {selectedThread.participants.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{selectedThread.participants.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" />
                <span className="font-medium">Chat with assistant</span>
              </div>
            )}
          </div>
        </div>
      </SelectTrigger>

      <SelectContent className="bg-background">
        {/* User assistant option (always first) */}
        <SelectItem value="assistant">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <span>Chat with assistant</span>
          </div>
        </SelectItem>

        {/* Separator if threads exist */}
        {threads.length > 0 && <div className="border-t my-1" />}

        {/* All threads sorted by name */}
        {threads
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((thread) => (
            <SelectItem key={thread.id} value={thread.id}>
              <div className="flex flex-col gap-0.5 w-full py-1">
                <div className="flex items-center gap-2 w-full">
                  <ThreadIcon />
                  <span className="truncate flex-1">{thread.name}</span>
                  {/* Attention indicator */}
                  {thread.needs_attention && (
                    <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  )}
                </div>
                {/* Status as free-form text */}
                {thread.status && thread.status !== 'Just created' && (
                  <span className="text-[10px] text-muted-foreground pl-5 truncate">
                    {thread.status}
                  </span>
                )}
                {/* Participant badges - always visible */}
                {thread.participants && thread.participants.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap pl-5">
                    {thread.participants.slice(0, 3).map((participant) => (
                      <span
                        key={participant}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] text-white/90"
                        style={{ backgroundColor: stringToColor(participant) }}
                      >
                        {participant}
                      </span>
                    ))}
                    {thread.participants.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">
                        +{thread.participants.length - 3}
                      </span>
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
