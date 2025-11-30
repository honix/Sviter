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
import { ArrowUp, Play } from 'lucide-react';

const ChatInterface: React.FC = () => {
  const { state, websocket, actions } = useAppContext();
  const { selectedAgent, isAgentRunning, connectionStatus } = state;
  const { messages, sendMessage, clearMessages } = useChat();
  const [inputValue, setInputValue] = useState('');

  const isConnected = connectionStatus === 'connected';
  const isInteractive = selectedAgent?.human_in_loop ?? true;

  const handleRunAgent = () => {
    if (!isConnected || isAgentRunning) return;
    actions.runAgent();
  };

  const handleSend = () => {
    if (!inputValue.trim() || !isConnected) return;

    const trimmedInput = inputValue.trim();

    // Handle /restart command
    if (trimmedInput === '/restart') {
      clearMessages();
      // Send reset to backend to restart the agent session
      websocket.sendMessage({ type: 'reset' });
      setInputValue('');
      return;
    }

    sendMessage(trimmedInput);
    setInputValue('');
  };

  return (
    <div className="h-full bg-background flex flex-col">
      {/* Chat Messages */}
      <ChatContainerRoot className="flex-1 min-h-0">
        <ChatContainerContent className="px-4 pt-4 pb-1">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-8">
              {isInteractive
                ? 'Ask a question about your wiki...'
                : 'Click "Run Agent" to start the agent'}
            </div>
          )}
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

      {/* Bottom section - Input for interactive, Run button for autonomous */}
      <div className="p-4 border-t border-border flex-shrink-0">
        {isInteractive ? (
          <PromptInput
            value={inputValue}
            onValueChange={setInputValue}
            onSubmit={handleSend}
            isLoading={!isConnected}
          >
            <PromptInputTextarea
              placeholder={isConnected ? "Type /restart to reset • Ask about your wiki..." : "Connecting..."}
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
        ) : (
          <Button
            onClick={handleRunAgent}
            disabled={!isConnected || isAgentRunning}
            className="w-full"
            size="lg"
          >
            <Play className="h-4 w-4 mr-2" />
            {isAgentRunning ? 'Agent Running...' : 'Run Agent'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;
