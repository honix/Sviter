import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { useAppContext } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { stringToColor, getInitials } from '../../utils/colors';
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
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Loader } from '@/components/ui/loader';
import { ArrowUp, GitBranch, Loader2, AlertCircle, CheckCircle, Check, XCircle } from 'lucide-react';
import type { Thread } from '../../types/thread';
import type { MarkdownLinkHandler } from '@/components/ui/markdown';
import { ThreadChangesView } from '../threads/ThreadChangesView';

interface ChatInterfaceProps {
  threadId: string;  // Always required - assistant or worker thread ID
  thread?: Thread | null;  // Worker thread metadata (null for assistant)
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ threadId, thread }) => {
  const { state, websocket, actions } = useAppContext();
  const { connectionStatus, assistantThreadId } = state;
  const { messages, sendMessage, clearMessages, isGenerating } = useChat(threadId);
  const [inputValue, setInputValue] = useState('');
  const [expandedSystemPrompts, setExpandedSystemPrompts] = useState<Set<string>>(new Set());
  const { userId: currentUserId } = useAuth();

  const toggleSystemPrompt = useCallback((messageId: string) => {
    setExpandedSystemPrompts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  const isConnected = connectionStatus === 'connected';
  const isAssistantMode = threadId === assistantThreadId;
  const isReviewMode = thread?.status === 'review';
  const isWorking = thread?.status === 'working';

  // Messages come directly from useChat hook (already filtered by threadId)
  const displayMessages = messages;

  const handleSend = () => {
    if (!inputValue.trim() || !isConnected) return;

    const trimmedInput = inputValue.trim();

    // Handle /restart command (only in assistant mode)
    if (isAssistantMode && trimmedInput === '/restart') {
      clearMessages();
      websocket.sendMessage({ type: 'reset' });
      setInputValue('');
      return;
    }

    // Send message via useChat hook (handles both assistant and worker)
    sendMessage(trimmedInput);
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
              {isAssistantMode
                ? 'Ask a question about your wiki...'
                : isWorking
                  ? 'Thread is working on the task...'
                  : 'Start a conversation with this thread...'}
            </div>
          )}
          {displayMessages.map((message) => (
            message.type === 'system_prompt' ? (
              // System prompt - collapsible, minimized by default
              <div
                key={message.id}
                className="mb-4 rounded-lg border border-border bg-muted/50 text-sm text-muted-foreground cursor-pointer hover:bg-muted/70 transition-colors"
                onClick={() => toggleSystemPrompt(message.id)}
              >
                <div className="flex items-center gap-2 p-2 px-3">
                  {expandedSystemPrompts.has(message.id) ? (
                    <ChevronDown className="h-3 w-3 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium text-muted-foreground/70">System Prompt</span>
                  {!expandedSystemPrompts.has(message.id) && (
                    <span className="text-xs text-muted-foreground/50 truncate">
                      {message.content.slice(0, 60)}...
                    </span>
                  )}
                </div>
                {expandedSystemPrompts.has(message.id) && (
                  <div className="px-3 pb-3 pt-1 whitespace-pre-wrap border-t border-border/50">
                    {message.content}
                  </div>
                )}
              </div>
            ) : message.type === 'tool_call' ? (
              // Tool call - status dot with brief summary (tool calls arrive after completion)
              (() => {
                const args = message.tool_args || {};
                const briefArgs = Object.entries(args)
                  .map(([k, v]) => {
                    const val = typeof v === 'string'
                      ? (v.length > 20 ? v.slice(0, 20) + '...' : v)
                      : String(v);
                    return `${k}: ${val}`;
                  })
                  .join(', ');
                const fullArgsEntries = Object.entries(args);
                return (
                  <Tooltip key={message.id}>
                    <TooltipTrigger asChild>
                      <div className="mb-4 px-4 flex items-center gap-2 text-xs opacity-70 cursor-default">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          message.tool_error ? 'bg-red-500' : 'bg-green-500'
                        }`} />
                        <span className="font-mono truncate">
                          {message.tool_name}({briefArgs})
                          {message.tool_error
                            ? <span className="text-red-500"> error: {message.content.slice(7, 57)}...</span>
                            : <span className="text-muted-foreground"> -&gt; done</span>
                          }
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-md font-mono text-xs bg-muted text-foreground border border-border shadow-md">
                      <div className="space-y-2">
                        <div className="font-bold border-b border-border pb-1">
                          {message.tool_name}
                        </div>
                        {fullArgsEntries.length > 0 ? (
                          <div className="space-y-1">
                            {fullArgsEntries.map(([k, v]) => (
                              <div key={k}>
                                <span className="font-bold">{k}:</span>{' '}
                                <span className="whitespace-pre-wrap">{typeof v === 'string' ? v : JSON.stringify(v)}</span>
                              </div>
                            ))}
                          </div>
                        ) : <div className="text-muted-foreground">No arguments</div>}
                        <div className="border-t border-border pt-1 mt-1">
                          {message.tool_error
                            ? <div className="text-red-700">{message.content.replace(/^Error:/, 'error:')}</div>
                            : <span className="text-green-700">✓ done</span>
                          }
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })()
            ) : (() => {
              // Unified styling for all threads (assistant + worker)
              const isUser = message.type === 'user';
              const isAI = message.type === 'assistant';
              // Use message's user_id or fall back to current user for messages without user_id
              const effectiveUserId = message.user_id || currentUserId;
              // Current user's messages align right, other users align left (like AI)
              const isCurrentUser = isUser && (!message.user_id || message.user_id === currentUserId);

              // Current user: right-aligned, Other users + AI: left-aligned
              // All users get primary color bubble
              const messageClassName = `mb-4 ${isCurrentUser ? 'flex-row-reverse' : ''}`;
              const contentClassName = isUser
                ? 'bg-primary text-primary-foreground'
                : '';

              // Avatar: pastel color + initials for users, AI avatar for assistant
              const avatarFallback = isAI ? 'AI' : getInitials(effectiveUserId);
              const avatarStyle = isUser && effectiveUserId
                ? { backgroundColor: stringToColor(effectiveUserId) }
                : undefined;

              return (
                <Message key={message.id} className={messageClassName}>
                  <MessageAvatar
                    src={isAI ? '/ai-avatar.png' : undefined}
                    alt={isAI ? 'AI' : effectiveUserId || 'User'}
                    fallback={avatarFallback}
                    style={avatarStyle}
                  />
                  <MessageContent
                    markdown={isAI}
                    className={contentClassName}
                    linkHandlers={isAI ? linkHandlers : undefined}
                  >
                    {message.content}
                  </MessageContent>
                </Message>
              );
            })()
          ))}
          {isGenerating && (
            <div className="mb-4 px-4">
              <Loader text="Working..." className="text-sm" />
            </div>
          )}
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
                : isAssistantMode
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
