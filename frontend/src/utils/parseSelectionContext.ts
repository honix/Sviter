export interface ParsedSelection {
  id: string;
  source: string | null;
  content: string;
  lineCount: number;
}

export interface ParsedMessage {
  text: string;
  selections: ParsedSelection[];
}

// Extract filename from path
const getFileName = (path: string): string => {
  const parts = path.split('/');
  return parts[parts.length - 1];
};

export function parseMessageWithContext(content: string): ParsedMessage {
  // Match <userProvidedContext>...</userProvidedContext> at the end
  const contextRegex = /<userProvidedContext>([\s\S]*?)<\/userProvidedContext>\s*$/;
  const contextMatch = content.match(contextRegex);

  if (!contextMatch) {
    return { text: content, selections: [] };
  }

  // Remove the context block from the text
  const text = content.replace(contextRegex, '').trim();

  // Parse individual selections
  const selectionsXml = contextMatch[1];
  const selectionRegex = /<contextItem\s+id="(#\d+)"(?:\s+source="([^"]*)")?\s*>([\s\S]*?)<\/contextItem>/g;
  const selections: ParsedSelection[] = [];

  let match;
  while ((match = selectionRegex.exec(selectionsXml)) !== null) {
    const [, id, source, selectionContent] = match;
    const trimmedContent = selectionContent.trim();
    selections.push({
      id,
      source: source || null,
      content: trimmedContent,
      lineCount: trimmedContent.split('\n').length,
    });
  }

  return { text, selections };
}

export function getSelectionFileName(source: string | null): string | null {
  if (!source) return null;
  return getFileName(source);
}
