import { Schema } from 'prosemirror-model';
import type { NodeSpec } from 'prosemirror-model';
import { schema as basicSchema } from 'prosemirror-schema-basic';
import { addListNodes } from 'prosemirror-schema-list';
import { tableNodes } from 'prosemirror-tables';
import { getApiUrl, resolvePath } from '../utils/url';

/**
 * ProseMirror schema for wiki pages
 * Based on basic schema with list, table, and image support
 */

/**
 * Module-level state for current page path.
 *
 * NOTE: This uses module-level state because ProseMirror's toDOM function
 * doesn't have access to EditorState or EditorView. Alternatives would require:
 * - Custom NodeView (significant complexity for image rendering)
 * - Storing resolved URLs in the document (loses relative path information)
 *
 * This pattern is safe when only one editor is active at a time (our use case).
 * setCurrentPagePath must be called when switching pages.
 */
let currentPagePath: string | null = null;

/**
 * Set the current page path for relative URL resolution.
 * Must be called when the editor loads a new page.
 */
export function setCurrentPagePath(pagePath: string | null): void {
  currentPagePath = pagePath;
}

/**
 * Convert relative image path to full API URL for rendering.
 * Resolves relative paths like GitHub does, then converts to API URL.
 */
function getImageUrl(src: string): string {
  // If already a full URL, return as-is
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }

  // Resolve the path relative to current page (GitHub-style)
  const resolvedPath = resolvePath(src, currentPagePath);

  // Convert to API URL (encode for the URL, but keep slashes)
  return `${getApiUrl()}/api/assets/${encodeURIComponent(resolvedPath).replace(/%2F/g, '/')}`;
}

// Image node specification
const imageNodeSpec: NodeSpec = {
  inline: true,
  attrs: {
    src: {},
    alt: { default: null },
    title: { default: null },
  },
  group: 'inline',
  draggable: true,
  parseDOM: [{
    tag: 'img[src]',
    getAttrs(dom) {
      const element = dom as HTMLElement;
      return {
        src: element.getAttribute('src'),
        alt: element.getAttribute('alt'),
        title: element.getAttribute('title'),
      };
    },
  }],
  toDOM(node) {
    return ['img', {
      src: getImageUrl(node.attrs.src),
      alt: node.attrs.alt,
      title: node.attrs.title,
      class: 'wiki-image',
    }];
  },
};

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

// Combine basic nodes + list nodes + table nodes + image node
const nodesWithLists = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block');
const nodesWithImages = nodesWithLists.addBefore('text', 'image', imageNodeSpec);
const schemaSpec = {
  nodes: nodesWithImages.append(tableNodeSpecs),
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
 * - image: Inline image with src, alt, title attributes
 * - text: Inline text node
 *
 * Marks:
 * - bold: Strong/bold text
 * - italic: Emphasized/italic text
 * - code: Inline code
 * - link: Hyperlink with href attribute
 */
