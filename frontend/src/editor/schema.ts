import { Schema } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';

/**
 * ProseMirror schema for wiki pages
 * Based on basic schema with list support
 */

// Add list nodes to the basic schema
const schemaSpec = {
  nodes: addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block'),
  marks: basicSchema.spec.marks,
};

export const schema = new Schema(schemaSpec);

/**
 * Schema includes:
 *
 * Nodes:
 * - doc: The root document node
 * - paragraph: Regular paragraph
 * - heading: Heading with level attribute (1-6)
 * - code_block: Code block
 * - blockquote: Block quote
 * - horizontal_rule: Horizontal line separator
 * - bullet_list: Unordered list
 * - ordered_list: Numbered list
 * - list_item: List item (for both types)
 * - text: Inline text node
 *
 * Marks:
 * - bold: Strong/bold text
 * - italic: Emphasized/italic text
 * - code: Inline code
 * - link: Hyperlink with href attribute
 */
