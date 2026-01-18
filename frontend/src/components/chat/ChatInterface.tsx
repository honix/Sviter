import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useAppDnd } from '../../contexts/DndContext';
import type { DragItemData } from '../../contexts/DndContext';
import { useChat } from '../../hooks/useChat';
import { useAppContext } from '../../contexts/AppContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSelection } from '../../contexts/SelectionContext';
import { SelectionBadge } from './SelectionBadge';
import { MessageContextBadges } from './MessageContextBadges';
import { MentionDropdown } from './MentionDropdown';
import { useMentions } from '../../hooks/useMentions';
import { parseMessageWithContext } from '../../utils/parseSelectionContext';
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
import { ArrowUp, AlertCircle, Check, Plus } from 'lucide-react';
import type { Thread } from '../../types/thread';
import type { MarkdownLinkHandler } from '@/components/ui/markdown';
import { ThreadChangesView } from '../threads/ThreadChangesView';

interface ChatInterfaceProps {
  threadId: string;  // Always required - assistant or worker thread ID
  thread?: Thread | null;  // Worker thread metadata (null for assistant)
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ threadId, thread }) => {
  const { state, websocket, actions } = useAppContext();
  const { connectionStatus, assistantThreadId, isCreatingThread } = state;
  const { messages, sendMessage, clearMessages, isGenerating } = useChat(threadId);
  const [inputValue, setInputValue] = useState('');
  const [expandedSystemPrompts, setExpandedSystemPrompts] = useState<Set<string>>(new Set());
  const { userId: currentUserId, user: currentUser } = useAuth();
  const { state: selectionState, clearAllContexts } = useSelection();

  // Handle @mention selection - insert @userId into input
  const handleMentionSelect = useCallback((userId: string) => {
    // Find the last @ and replace everything from there with @userId
    const lastAtIndex = inputValue.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const beforeAt = inputValue.slice(0, lastAtIndex);
      setInputValue(beforeAt + '@' + userId + ' ');
    }
  }, [inputValue]);

  const mentions = useMentions({
    inputValue,
    onMentionSelect: handleMentionSelect
  });

  // dnd-kit droppable for dragging items into chat
  const { setNodeRef: setDroppableRef, isOver: isDndOver } = useDroppable({
    id: 'chat-drop-zone',
  });
  const { registerDropHandler, unregisterDropHandler } = useAppDnd();

  // Handle dnd-kit drop - insert reference into input
  const handleDndDrop = useCallback((item: DragItemData) => {
    let textToInsert = '';
    if (item.type === 'image') {
      textToInsert = `![${item.name}](/${item.path})`;
    } else if (item.type === 'page') {
      textToInsert = `[${item.name}](/${item.path})`;
    } else if (item.type === 'folder') {
      textToInsert = `/${item.path}`;
    }

    if (textToInsert) {
      setInputValue(prev => prev + (prev ? ' ' : '') + textToInsert);
    }
  }, []);

  // Register drop handler with dnd context
  useEffect(() => {
    registerDropHandler('chat-drop-zone', handleDndDrop);
    return () => unregisterDropHandler('chat-drop-zone');
  }, [registerDropHandler, unregisterDropHandler, handleDndDrop]);

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
  // Show accept for any worker thread that isn't already accepted/archived
  const canAccept = thread && thread.type === 'worker' &&
    thread.status !== 'accepted' && thread.status !== 'archived';

  // Messages come directly from useChat hook (already filtered by threadId)
  const displayMessages = messages;

  const handleSend = () => {
    if (!inputValue.trim() || !isConnected) return;

    let messageToSend = inputValue.trim();

    // Handle /new command (only in assistant mode)
    if (isAssistantMode && messageToSend === '/new') {
      clearMessages();
      websocket.sendMessage({ type: 'reset' });
      setInputValue('');
      return;
    }

    // Append selection contexts in XML format
    if (selectionState.addedContexts.length > 0) {
      const selections = selectionState.addedContexts.map(({ text, filePath }, index) => {
        const source = filePath ? ` source="${filePath}"` : '';
        return `<contextItem id="#${index + 1}"${source}>\n${text}\n</contextItem>`;
      }).join('\n');
      const contextXml = `\n\n<userProvidedContext>\n${selections}\n</userProvidedContext>`;
      messageToSend = messageToSend + contextXml;
      clearAllContexts();
    }

    // Send message via useChat hook (handles both assistant and worker)
    sendMessage(messageToSend);
    setInputValue('');
  };

  const handleAcceptChanges = () => {
    if (!threadId) return;
    actions.acceptThread(threadId);
  };

  // Spawn a new collaborative thread with current message
  const handleSpawn = () => {
    console.log('🚀 handleSpawn called, inputValue:', inputValue, 'isConnected:', isConnected);
    if (!inputValue.trim() || !isConnected) return;

    let messageToSend = inputValue.trim();

    // Append selection contexts in XML format
    if (selectionState.addedContexts.length > 0) {
      const selections = selectionState.addedContexts.map(({ text, filePath }, index) => {
        const source = filePath ? ` source="${filePath}"` : '';
        return `<contextItem id="#${index + 1}"${source}>\n${text}\n</contextItem>`;
      }).join('\n');
      const contextXml = `\n\n<userProvidedContext>\n${selections}\n</userProvidedContext>`;
      messageToSend = messageToSend + contextXml;
      clearAllContexts();
    }

    // Show loading state
    actions.setCreatingThread(true);

    // Spawn collaborative thread via WebSocket
    console.log('🚀 Sending spawn_collaborative_thread:', messageToSend.slice(0, 50));
    websocket.sendMessage({
      type: 'spawn_collaborative_thread',
      first_message: messageToSend
    });
    setInputValue('');

    // Timeout fallback - clear loading if thread_selected never arrives
    setTimeout(() => {
      // Check current state via a fresh read (closure would capture stale value)
      // The action will be a no-op if already false
      actions.setCreatingThread(false);
    }, 15000);
  };

  // Link handlers for markdown links
  const handleThreadClick = useCallback((clickedThreadId: string) => {
    actions.selectThread(clickedThreadId);
  }, [actions]);

  const handlePageClick = useCallback(async (pagePath: string) => {
    // Find the page by path and set it as current
    const page = state.pages.find(p => p.path === pagePath);
    if (page) {
      await actions.setCurrentPage(page);
    } else {
      // Page might be newly created by a thread - create minimal page object
      // setCurrentPage will fetch the actual content from the server
      const ext = pagePath.split('.').pop()?.toLowerCase();
      const fileType = ext === 'csv' ? 'csv' : ext === 'tsx' ? 'tsx' : 'markdown';
      const minimalPage = {
        path: pagePath,
        title: pagePath.split('/').pop() || pagePath,
        content: '',
        file_type: fileType as 'markdown' | 'csv' | 'tsx',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await actions.setCurrentPage(minimalPage);
    }
  }, [actions, state.pages]);

  const linkHandlers: MarkdownLinkHandler = useMemo(() => ({
    onThreadClick: handleThreadClick,
    onPageClick: handlePageClick
  }), [handleThreadClick, handlePageClick]);

  return (
    <div className="h-full bg-background flex flex-col relative">
      {/* Loading overlay when creating thread */}
      {isCreatingThread && (
        <div className="absolute inset-0 bg-background/70 z-50 flex items-center justify-center">
          <Loader text="Creating thread..." className="text-sm" />
        </div>
      )}

      {/* Thread Changes Section - only shown when viewing a thread with changes */}
      {thread && canAccept && thread?.branch && (
        <div className="px-4 py-2 border-b border-border flex-shrink-0 bg-muted/30">
          <ThreadChangesView
            branch={thread.branch}
            baseBranch="main"
            compact
            renderActions={() => (
              thread?.merge_blocked ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        disabled
                        className="bg-muted text-muted-foreground cursor-not-allowed"
                      >
                        <AlertCircle className="h-4 w-4 mr-1" />
                        Blocked
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">Pages being edited:</p>
                    <ul className="text-xs mt-1">
                      {Object.entries(thread.blocked_pages || {}).map(([page, editors]) => (
                        <li key={page}>• {page} ({(editors as string[]).length} editor{(editors as string[]).length > 1 ? 's' : ''})</li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  size="sm"
                  onClick={handleAcceptChanges}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Accept and merge to main
                </Button>
              )
            )}
          />
        </div>
      )}

      {/* Chat Messages */}
      <ChatContainerRoot className="flex-1 min-h-0">
        <ChatContainerContent className="px-4 pt-4 pb-1" data-testid="chat-messages">
          {displayMessages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              {isAssistantMode
                ? 'Chat with your assistant - ask questions about the wiki...'
                : 'New thread - ask for edits, tag users with @username...'}
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
              // Use current user's name for current user, otherwise use message's user_name
              const userName = isCurrentUser ? currentUser?.name : message.user_name;
              const avatarFallback = isAI ? 'AI' : getInitials(effectiveUserId, userName);
              const avatarStyle = isUser && effectiveUserId
                ? { backgroundColor: stringToColor(effectiveUserId), color: 'white' }
                : undefined;

              return (() => {
                const parsed = isUser ? parseMessageWithContext(message.content) : null;
                const hasSelections = parsed && parsed.selections.length > 0;

                return (
                  <Message key={message.id} className={messageClassName}>
                    <MessageAvatar
                      src={isAI ? '/ai-avatar.png' : undefined}
                      alt={isAI ? 'AI' : effectiveUserId || 'User'}
                      fallback={avatarFallback}
                      style={avatarStyle}
                    />
                    <div className="flex flex-col">
                      {hasSelections && (
                        <div className="flex flex-wrap gap-1 ml-3 mr-3 mb-[-10px] z-10 relative">
                          <MessageContextBadges selections={parsed.selections} />
                        </div>
                      )}
                      <MessageContent
                        markdown={isAI}
                        className={contentClassName}
                        linkHandlers={isAI ? linkHandlers : undefined}
                      >
                        {isUser ? parsed!.text : message.content}
                      </MessageContent>
                    </div>
                  </Message>
                );
              })();
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
      <div
        ref={setDroppableRef}
        className={`p-4 border-t flex-shrink-0 transition-colors ${
          isDndOver ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <div className="relative">
          <SelectionBadge />
          {/* @mention dropdown - positioned above input */}
          <MentionDropdown
            users={mentions.filteredUsers}
            isOpen={mentions.isOpen}
            selectedIndex={mentions.selectedIndex}
            onSelect={mentions.selectMention}
            onHover={mentions.setSelectedIndex}
          />
          <PromptInput
            value={inputValue}
            onValueChange={setInputValue}
            onSubmit={handleSend}
            isLoading={!isConnected}
          >
            <PromptInputTextarea
              placeholder={
                !isConnected
                  ? "Connecting to the chat..."
                  : isAssistantMode
                    ? "Type /new to start fresh • Ask about your wiki..."
                    : canAccept
                      ? "Request changes or ask questions..."
                      : "Send a message to this thread..."
              }
              disabled={!isConnected}
              onKeyDown={(e) => {
                // Let mention hook handle keyboard navigation first
                if (mentions.handleKeyDown(e)) {
                  return;
                }
              }}
            />
            <PromptInputActions>
              {/* Pill-shaped button: Send (2/3) + Spawn (1/3) */}
              <div className="flex rounded-full overflow-hidden">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleSend}
                      disabled={!isConnected || !inputValue.trim()}
                      data-testid="send-message-button"
                      className="rounded-l-full rounded-r-none h-9 px-6"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Send message</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleSpawn}
                      disabled={!isConnected || !inputValue.trim()}
                      data-testid="start-thread-button"
                      className="rounded-r-full rounded-l-none bg-pink-500 hover:bg-pink-600 border-l border-pink-400 h-9 px-3"
                    >
                      <Plus className="h-4 w-4 text-white" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Start thread</TooltipContent>
                </Tooltip>
              </div>
            </PromptInputActions>
          </PromptInput>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
