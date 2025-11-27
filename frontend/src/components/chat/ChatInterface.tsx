import React, { useState } from 'react';
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
import { ArrowUp, Trash2, Plus } from 'lucide-react';

const ChatInterface: React.FC = () => {
  const { state, actions } = useAppContext();
  const { chatMode, currentAgent, currentAgentModel } = state;
  const { messages, isConnected, connectionStatus, sendMessage, clearMessages } = useChat();
  const [inputValue, setInputValue] = useState('');

  const isAgentViewing = chatMode === 'agent-viewing';

  const handleSend = () => {
    if (inputValue.trim() && isConnected) {
      sendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Connection Error';
      default: return 'Disconnected';
    }
  };

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {isAgentViewing ? `Agent: ${currentAgent}` : 'AI Assistant'}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {currentAgentModel && `Model: ${currentAgentModel}`}
              {isAgentViewing && currentAgentModel && ' • '}
              {isAgentViewing && 'Viewing agent execution (read-only)'}
              {!isAgentViewing && !currentAgentModel && 'Interactive chat mode'}
            </p>
          </div>
          <Button
            onClick={isAgentViewing ? actions.startNewChat : clearMessages}
            variant="ghost"
            size="sm"
          >
            {isAgentViewing ? (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Start New Chat
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </>
            )}
          </Button>
        </div>
        <div className="flex items-center mt-2">
          <div className={`w-2 h-2 rounded-full mr-2 ${getStatusColor()}`}></div>
          <span className="text-sm text-muted-foreground">
            {getStatusText()}
          </span>
        </div>
      </div>

      {/* Chat Messages */}
      <ChatContainerRoot className="flex-1 min-h-0 p-4">
        <ChatContainerContent>
          {messages.map((message) => (
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
              >
                {message.content}
              </MessageContent>
            </Message>
          ))}
          <ChatContainerScrollAnchor />
        </ChatContainerContent>
      </ChatContainerRoot>

      {/* Message Input */}
      {!isAgentViewing && (
        <div className="p-4 border-t border-border flex-shrink-0">
          <PromptInput
            value={inputValue}
            onValueChange={setInputValue}
            onSubmit={handleSend}
            isLoading={!isConnected}
          >
            <PromptInputTextarea
              placeholder={isConnected ? "Ask the AI about your wiki..." : "Connecting..."}
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
      )}
    </div>
  );
};

export default ChatInterface;