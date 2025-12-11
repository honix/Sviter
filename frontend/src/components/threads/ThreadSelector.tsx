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
import {
  MessageCircle,
  AlertCircle,
  CheckCircle,
  Loader2,
  GitBranch,
  Check,
  XCircle,
} from "lucide-react";
import type { Thread, ThreadStatus } from "../../types/thread";

interface ThreadSelectorProps {
  threads: Thread[];
  selectedThreadId: string | null; // null = assistant mode
  onSelect: (threadId: string | null) => void;
  isConnected: boolean;
  disabled?: boolean;
}

const StatusIcon: React.FC<{ status: ThreadStatus }> = ({ status }) => {
  switch (status) {
    case "working":
      return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
    case "need_help":
      return <AlertCircle className="h-3 w-3 text-yellow-500" />;
    case "review":
      return <CheckCircle className="h-3 w-3 text-green-500" />;
    case "accepted":
      return <Check className="h-3 w-3 text-green-600" />;
    case "rejected":
      return <XCircle className="h-3 w-3 text-red-500" />;
  }
};

const statusLabel: Record<ThreadStatus, string> = {
  working: "Working",
  need_help: "Needs help",
  review: "Ready for review",
  accepted: "Accepted",
  rejected: "Rejected",
};

export function ThreadSelector({
  threads,
  selectedThreadId,
  onSelect,
  isConnected,
  disabled,
}: ThreadSelectorProps) {
  const selectedThread = selectedThreadId
    ? threads.find((t) => t.id === selectedThreadId)
    : null;

  const handleValueChange = (value: string) => {
    onSelect(value === "assistant" ? null : value);
  };

  return (
    <Select
      value={selectedThreadId || "assistant"}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full h-auto py-2">
        <div className="flex items-center gap-2 w-full">
          {/* Connection indicator */}
          <div
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isConnected ? "bg-green-500" : "bg-gray-400"
            }`}
          />

          <div className="flex flex-col items-start text-left flex-1 min-w-0">
            {selectedThread ? (
              <>
                <div className="flex items-center gap-1.5">
                  <StatusIcon status={selectedThread.status} />
                  <span className="font-medium truncate">
                    {selectedThread.name}
                  </span>
                </div>
                {selectedThread.type !== 'assistant' && selectedThread.branch && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    <span className="truncate">{selectedThread.branch}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4" />
                  <span className="font-medium">User Assistant</span>
                </div>
              </>
            )}
          </div>
        </div>
      </SelectTrigger>

      <SelectContent className="bg-background">
        {/* User assistant option (always first) */}
        <SelectItem value="assistant">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            <span>User Assistant</span>
          </div>
        </SelectItem>

        {/* Separator if threads exist */}
        {threads.length > 0 && <div className="border-t my-1" />}

        {/* Thread options grouped by status */}
        {(
          [
            "review",
            "need_help",
            "working",
            "accepted",
            "rejected",
          ] as ThreadStatus[]
        ).map((status) => {
          const statusThreads = threads.filter((t) => t.status === status);
          if (statusThreads.length === 0) return null;

          return statusThreads.map((thread) => (
            <SelectItem key={thread.id} value={thread.id}>
              <div className="flex items-center gap-2">
                <StatusIcon status={thread.status} />
                <span className="truncate max-w-[150px]">{thread.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({statusLabel[thread.status]})
                </span>
              </div>
            </SelectItem>
          ));
        })}

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
