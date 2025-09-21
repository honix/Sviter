// Simple markdown parser for basic formatting
export function parseMarkdown(content: string): React.ReactElement[] {
  const lines = content.split('\n');
  const elements: React.ReactElement[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      elements.push(
        React.createElement('h1', {
          key: i,
          className: 'text-3xl font-bold mb-4 text-gray-900 dark:text-white'
        }, line.slice(2))
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        React.createElement('h2', {
          key: i,
          className: 'text-2xl font-bold mb-3 text-gray-900 dark:text-white'
        }, line.slice(3))
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        React.createElement('h3', {
          key: i,
          className: 'text-xl font-bold mb-2 text-gray-900 dark:text-white'
        }, line.slice(4))
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      // Simple list item (would need more sophisticated parsing for nested lists)
      elements.push(
        React.createElement('li', {
          key: i,
          className: 'ml-4 mb-1 text-gray-700 dark:text-gray-300'
        }, line.slice(2))
      );
    } else if (line.trim() === '') {
      elements.push(React.createElement('br', { key: i }));
    } else if (line.trim().length > 0) {
      // Regular paragraph
      const formattedLine = formatInlineMarkdown(line);
      elements.push(
        React.createElement('p', {
          key: i,
          className: 'mb-2 text-gray-700 dark:text-gray-300 leading-relaxed',
          dangerouslySetInnerHTML: { __html: formattedLine }
        })
      );
    }
  }

  return elements;
}

function formatInlineMarkdown(text: string): string {
  // Handle bold **text**
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');

  // Handle italic *text*
  text = text.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

  // Handle inline code `code`
  text = text.replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">$1</code>');

  // Handle links [text](url)
  text = text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '<a href="$2" class="text-blue-600 dark:text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>');

  return text;
}

// React import for createElement
import React from 'react';