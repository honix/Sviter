import React, { useState, useMemo, useCallback } from 'react';
import { useChat } from '../../hooks/useChat';
import { useAppContext } from '../../contexts/AppContext';
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from '@/components/ui/chat-container';
import {
  Message,
  MessageAvatar,
  MessageContent,
} from '@/components/ui/message';
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from '@/components/ui/prompt-input';
import { Button } from '@/components/ui/button';
import { ArrowUp, GitBranch, Loader2, AlertCircle, CheckCircle, Check, XCircle } from 'lucide-react';
import type { Thread, ThreadMessage } from '../../types/thread';
import type { ChatMessage } from '../../types/chat';
import type { MarkdownLinkHandler } from '@/components/ui/markdown';
import { ThreadChangesView } from '../threads/ThreadChangesView';

interface ChatInterfaceProps {
  threadId: string | null;  // null = scout mode
  thread?: Thread | null;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ threadId, thread }) => {
  const { state, websocket, actions } = useAppContext();
  const { connectionStatus, threadMessages } = state;
  const { messages: scoutMessages, sendMessage: sendScoutMessage, clearMessages } = useChat();
  const [inputValue, setInputValue] = useState('');

  const isConnected = connectionStatus === 'connected';
  const isScoutMode = threadId === null;
  const isReviewMode = thread?.status === 'review';
  const isWorking = thread?.status === 'working';

  // Convert thread messages to chat messages format for display
  const displayMessages: ChatMessage[] = useMemo(() => {
    if (isScoutMode) {
      return scoutMessages;
    }

    // Get thread messages and convert to ChatMessage format
    const threadMsgs = threadMessages[threadId!] || [];
    return threadMsgs.map((msg: ThreadMessage): ChatMessage => ({
      id: msg.id,
      type: msg.role === 'user' ? 'user'
          : msg.role === 'tool_call' ? 'tool_call'
          : msg.role.includes('system') ? 'system_prompt'
          : 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
      tool_name: msg.tool_name
    }));
  }, [isScoutMode, scoutMessages, threadMessages, threadId]);

  const handleSend = () => {
    if (!inputValue.trim() || !isConnected) return;

    const trimmedInput = inputValue.trim();

    // Handle /restart command (only in scout mode)
    if (isScoutMode && trimmedInput === '/restart') {
      clearMessages();
      websocket.sendMessage({ type: 'reset' });
      setInputValue('');
      return;
    }

    // Send message (WebSocket routes to appropriate thread/scout)
    if (isScoutMode) {
      sendScoutMessage(trimmedInput);
    } else {
      // For threads, send via WebSocket with thread context
      websocket.sendMessage({
        type: 'chat',
        message: trimmedInput,
        thread_id: threadId
      });
    }
    setInputValue('');
  };

  const handleAcceptChanges = () => {
    if (!threadId) return;
    actions.acceptThread(threadId);
  };

  const handleRejectChanges = () => {
    if (!threadId) return;
    actions.rejectThread(threadId);
  };

  // Status icon for thread header
  const StatusIcon = () => {
    if (!thread) return null;
    switch (thread.status) {
      case 'working':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'need_help':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'review':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'accepted':
        return <Check className="h-4 w-4 text-green-600" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const statusLabel: Record<string, string> = {
    'working': 'Working...',
    'need_help': 'Needs your help',
    'review': 'Ready for review',
    'accepted': 'Accepted',
    'rejected': 'Rejected'
  };

  // Link handlers for markdown links
  const handleThreadClick = useCallback((clickedThreadId: string) => {
    actions.selectThread(clickedThreadId);
  }, [actions]);

  const handlePageClick = useCallback(async (pageTitle: string) => {
    // Find the page and set it as current
    const page = state.pages.find(p => p.title === pageTitle);
    if (page) {
      await actions.setCurrentPage(page);
    }
  }, [actions, state.pages]);

  const linkHandlers: MarkdownLinkHandler = useMemo(() => ({
    onThreadClick: handleThreadClick,
    onPageClick: handlePageClick
  }), [handleThreadClick, handlePageClick]);

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Thread Header - only shown when viewing a thread */}
      {thread && (
        <div className="px-4 py-3 border-b border-border flex-shrink-0 bg-muted/30">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <StatusIcon />
                <span className="font-medium">{thread.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({statusLabel[thread.status] || thread.status})
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span className="font-mono">{thread.branch}</span>
              </div>
            </div>

            {/* Accept/Reject buttons - only in review mode */}
            {isReviewMode && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRejectChanges}
                  className="text-destructive hover:text-destructive"
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={handleAcceptChanges}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Accept Changes
                </Button>
              </div>
            )}
          </div>

          {/* Review summary if available */}
          {isReviewMode && thread.review_summary && (
            <div className="mt-2 p-2 rounded bg-muted text-sm">
              <span className="text-muted-foreground">Summary: </span>
              {thread.review_summary}
            </div>
          )}

          {/* Changes view - show in review mode */}
          {isReviewMode && (
            <div className="mt-3 border-t border-border pt-3">
              <ThreadChangesView
                branch={thread.branch}
                baseBranch="main"
                compact
              />
            </div>
          )}
        </div>
      )}

      {/* Chat Messages */}
      <ChatContainerRoot className="flex-1 min-h-0">
        <ChatContainerContent className="px-4 pt-4 pb-1">
          {displayMessages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              {isScoutMode
                ? 'Ask a question about your wiki...'
                : isWorking
                  ? 'Thread is working on the task...'
                  : 'Start a conversation with this thread...'}
            </div>
          )}
          {displayMessages.map((message) => (
            message.type === 'system_prompt' ? (
              // System prompt - distinct styling, full width
              <div
                key={message.id}
                className="mb-4 p-3 rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground"
              >
                <div className="text-xs font-medium text-muted-foreground/70 mb-2">System Prompt</div>
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            ) : message.type === 'tool_call' ? (
              // Tool call - subtle indicator with animated dot
              <div key={message.id} className="my-2 py-2 px-4 flex items-center gap-2 opacity-60">
                <div className={`w-1.5 h-1.5 rounded-full bg-primary/60 ${isWorking ? 'animate-pulse' : ''}`} />
                <span className="text-xs text-muted-foreground font-mono tracking-wide">
                  Tool: {message.tool_name}
                </span>
              </div>
            ) : (
              <Message
                key={message.id}
                className={`mb-4 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <MessageAvatar
                  src={message.type === 'user' ? '/user-avatar.png' : '/ai-avatar.png'}
                  alt={message.type === 'user' ? 'User' : 'AI'}
                  fallback={message.type === 'user' ? 'U' : 'AI'}
                />
                <MessageContent
                  markdown={message.type === 'assistant'}
                  className={message.type === 'user' ? 'bg-primary text-primary-foreground' : ''}
                  linkHandlers={message.type === 'assistant' ? linkHandlers : undefined}
                >
                  {message.content}
                </MessageContent>
              </Message>
            )
          ))}
          <ChatContainerScrollAnchor />
        </ChatContainerContent>
      </ChatContainerRoot>

      {/* Bottom section - Chat input always available */}
      <div className="p-4 border-t border-border flex-shrink-0">
        <PromptInput
          value={inputValue}
          onValueChange={setInputValue}
          onSubmit={handleSend}
          isLoading={!isConnected}
        >
          <PromptInputTextarea
            placeholder={
              !isConnected
                ? "Connecting..."
                : isScoutMode
                  ? "Type /restart to reset • Ask about your wiki..."
                  : isReviewMode
                    ? "Request changes or ask questions..."
                    : "Send a message to this thread..."
            }
            disabled={!isConnected}
          />
          <PromptInputActions>
            <PromptInputAction tooltip="Send message">
              <Button
                onClick={handleSend}
                disabled={!isConnected || !inputValue.trim()}
                size="icon"
                className="rounded-full"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>
      </div>
    </div>
  );
};

export default ChatInterface;
