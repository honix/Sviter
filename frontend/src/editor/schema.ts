import { Schema } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { tableNodes } from 'prosemirror-tables';

/**
 * ProseMirror schema for wiki pages
 * Based on basic schema with list and table support
 */

// Get table nodes with alignment support for GFM tables
// Using inline* for cellContent to allow direct inline content from markdown parser
const tableNodeSpecs = tableNodes({
  tableGroup: 'block',
  cellContent: 'inline*',
  cellAttributes: {
    alignment: {
      default: null,
      getFromDOM(dom) {
        return (dom as HTMLElement).style.textAlign || null;
      },
      setDOMAttr(value, attrs) {
        if (value) attrs.style = `text-align: ${value}`;
      },
    },
  },
});

// Combine basic nodes + list nodes + table nodes
const nodesWithLists = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block');
const schemaSpec = {
  nodes: nodesWithLists.append(tableNodeSpecs),
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
 * - table: Table container
 * - table_row: Table row
 * - table_header: Header cell (th) with optional alignment
 * - table_cell: Regular cell (td) with optional alignment
 * - text: Inline text node
 *
 * Marks:
 * - bold: Strong/bold text
 * - italic: Emphasized/italic text
 * - code: Inline code
 * - link: Hyperlink with href attribute
 */
