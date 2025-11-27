import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../../types/chat';

interface MessageListProps {
  messages: ChatMessage[];
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Start a conversation with the AI assistant
          </p>
          <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">
            Ask me to create, edit, or find pages
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="h-full p-4 overflow-y-auto custom-scrollbar"
    >
      <div className="space-y-4">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
};

interface MessageItemProps {
  message: ChatMessage;
}

const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.type === 'user';
  const isSystem = message.type === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-full text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
        isUser
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
      }`}>
        <div className="text-sm whitespace-pre-wrap">
          {message.content}
        </div>

        {/* Tool calls display */}
        {message.tool_calls && message.tool_calls.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            {message.tool_calls.map((toolCall) => (
              <div key={toolCall.id} className="text-xs opacity-75">
                <div className="font-mono">
                  🔧 {toolCall.function.name}
                </div>
                {toolCall.result && (
                  <div className="mt-1 pl-4 border-l-2 border-gray-300 dark:border-gray-600">
                    {toolCall.result}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="text-xs opacity-50 mt-1">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

export default MessageList;