import { Node as ProseMirrorNode } from 'prosemirror-model';
import { MarkdownParser, MarkdownSerializer, defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import { schema } from './schema';

/**
 * Parser to convert markdown string to ProseMirror document
 */
export const markdownParser = new MarkdownParser(
  schema,
  defaultMarkdownParser.tokenizer,
  defaultMarkdownParser.tokens
);

/**
 * Serializer to convert ProseMirror document to markdown string
 */
export const markdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    // Ensure paragraph serialization doesn't add extra newlines
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
  },
  defaultMarkdownSerializer.marks
);

/**
 * Convert markdown string to ProseMirror document
 */
export function markdownToProseMirror(markdown: string): ProseMirrorNode {
  try {
    return markdownParser.parse(markdown) || schema.node('doc', null, [schema.node('paragraph')]);
  } catch (error) {
    console.error('Error parsing markdown:', error);
    // Return empty document on error
    return schema.node('doc', null, [schema.node('paragraph')]);
  }
}

/**
 * Convert ProseMirror document to markdown string
 */
export function prosemirrorToMarkdown(doc: ProseMirrorNode): string {
  try {
    return markdownSerializer.serialize(doc);
  } catch (error) {
    console.error('Error serializing to markdown:', error);
    return '';
  }
}

/**
 * Check if two ProseMirror documents are equal
 */
export function docsEqual(doc1: ProseMirrorNode, doc2: ProseMirrorNode): boolean {
  return doc1.eq(doc2);
}
