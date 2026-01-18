import { Node as ProseMirrorNode } from 'prosemirror-model';
import { MarkdownParser, MarkdownSerializer, defaultMarkdownParser, defaultMarkdownSerializer } from 'prosemirror-markdown';
import MarkdownIt from 'markdown-it';
import { schema } from './schema';

/**
 * Create markdown-it instance with GFM tables enabled
 */
const markdownIt = MarkdownIt('default', { html: false }).enable('table');

/**
 * Custom token handler for table cells that wraps content in a paragraph
 */
function tableCellHandler(nodeType: 'table_header' | 'table_cell') {
  return {
    block: nodeType,
    getAttrs: (tok: { attrGet: (name: string) => string | null }) => {
      const style = tok.attrGet('style') || '';
      const match = style.match(/text-align:\s*(\w+)/);
      return { alignment: match ? match[1] : null };
    },
  };
}

/**
 * Parser to convert markdown string to ProseMirror document
 */
export const markdownParser = new MarkdownParser(
  schema,
  markdownIt,
  {
    ...defaultMarkdownParser.tokens,
    // Ensure inline code is handled
    code_inline: { mark: 'code' },
    // Image token - check for chart references
    image: {
      node: 'image',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getAttrs: (tok: any) => {
        const src = tok.attrGet('src');
        // Check if this is a chart reference (ends with .chart.csv or similar)
        if (src && src.match(/\.chart\.(csv|json)$/)) {
          return null; // Will be handled by special chart parser below
        }
        return {
          src: tok.attrGet('src'),
          alt: tok.children?.[0]?.content || null,
          title: tok.attrGet('title'),
        };
      },
    },
    // Code fence - check for mermaid
    fence: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      node: 'code_block',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getAttrs: (tok: any) => {
        const info = tok.info || '';
        if (info.trim() === 'mermaid') {
          return null; // Will be handled by mermaid parser below
        }
        return { params: info };
      },
    },
    // Table tokens - cells need special handling to wrap content in paragraphs
    table: { block: 'table' },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: 'table_row' },
    th: tableCellHandler('table_header'),
    td: tableCellHandler('table_cell'),
  }
);

/**
 * Helper to serialize cell content inline
 * Cells contain inline content directly (text with marks)
 */
function serializeCellContent(node: ProseMirrorNode): string {
  let content = '';
  node.forEach((child) => {
    if (child.isText) {
      let text = child.text || '';
      // Apply marks
      child.marks.forEach((mark) => {
        if (mark.type.name === 'strong') text = `**${text}**`;
        else if (mark.type.name === 'em') text = `*${text}*`;
        else if (mark.type.name === 'code') text = `\`${text}\``;
        else if (mark.type.name === 'link') text = `[${text}](${mark.attrs.href})`;
      });
      content += text;
    }
  });
  // Escape pipe characters in cell content
  return content.replace(/\|/g, '\\|').trim();
}

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
    // Image serialization to markdown format
    // Use angle brackets for paths with spaces: ![alt](<path with spaces>)
    image(state, node) {
      const alt = state.esc(node.attrs.alt || '');
      const src = node.attrs.src;
      const title = node.attrs.title;
      // Wrap in angle brackets if path contains spaces
      const srcFormatted = src.includes(' ') ? `<${src}>` : src;
      state.write(`![${alt}](${srcFormatted}${title ? ` "${state.esc(title)}"` : ''})`);
    },
    // Force tight lists (no blank lines between items) and use - instead of *
    bullet_list(state, node) {
      state.renderList(node, "  ", () => "- ");
    },
    ordered_list(state, node) {
      const start = node.attrs.order || 1;
      const maxW = String(start + node.childCount - 1).length;
      const space = state.repeat(" ", maxW + 2);
      state.renderList(node, space, i => {
        const nStr = String(start + i);
        return state.repeat(" ", maxW - nStr.length) + nStr + ". ";
      });
    },
    // Table serialization to GFM format
    table(state, node) {
      const rows: { cells: string[]; alignments: (string | null)[] }[] = [];
      let headerAlignments: (string | null)[] = [];
      let isFirstRow = true;

      node.forEach((row) => {
        const cells: string[] = [];
        const alignments: (string | null)[] = [];

        row.forEach((cell) => {
          cells.push(serializeCellContent(cell));
          alignments.push(cell.attrs.alignment || null);
        });

        if (isFirstRow) {
          headerAlignments = alignments;
          isFirstRow = false;
        }

        rows.push({ cells, alignments });
      });

      if (rows.length === 0) return;

      // Calculate column widths for nice formatting
      const colCount = rows[0].cells.length;
      const colWidths: number[] = [];
      for (let i = 0; i < colCount; i++) {
        let maxWidth = 3; // Minimum width for separator
        rows.forEach((row) => {
          if (row.cells[i]) {
            maxWidth = Math.max(maxWidth, row.cells[i].length);
          }
        });
        colWidths.push(maxWidth);
      }

      // Write header row
      state.write('| ');
      rows[0].cells.forEach((cell, i) => {
        state.write(cell.padEnd(colWidths[i]));
        state.write(' | ');
      });
      state.write('\n');

      // Write separator row with alignments
      state.write('| ');
      headerAlignments.forEach((align, i) => {
        let sep = '-'.repeat(colWidths[i]);
        if (align === 'left') sep = ':' + sep.slice(1);
        else if (align === 'right') sep = sep.slice(1) + ':';
        else if (align === 'center') sep = ':' + sep.slice(2) + ':';
        state.write(sep);
        state.write(' | ');
      });
      state.write('\n');

      // Write body rows
      for (let i = 1; i < rows.length; i++) {
        state.write('| ');
        rows[i].cells.forEach((cell, j) => {
          state.write((cell || '').padEnd(colWidths[j]));
          state.write(' | ');
        });
        state.write('\n');
      }

      state.write('\n');
    },
    // These are handled by table serializer
    table_row() {},
    table_header() {},
    table_cell() {},
    // Mermaid diagram serialization
    mermaid(state, node) {
      state.write('```mermaid\n');
      state.write(node.attrs.content);
      state.write('\n```');
      state.closeBlock(node);
    },
    // Chart reference serialization
    chart(state, node) {
      const alt = node.attrs.chartType || '';
      state.write(`![${alt}](${node.attrs.src})`);
      state.closeBlock(node);
    },
  },
  defaultMarkdownSerializer.marks
);

/**
 * Pre-process markdown to extract mermaid and chart blocks
 */
function preprocessMarkdown(markdown: string): { markdown: string; special: Array<{ type: 'mermaid' | 'chart'; data: any; placeholder: string }> } {
  const special: Array<{ type: 'mermaid' | 'chart'; data: any; placeholder: string }> = [];
  let processed = markdown;

  // Extract mermaid blocks
  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
  let match;
  let mermaidIndex = 0;
  while ((match = mermaidRegex.exec(markdown)) !== null) {
    const placeholder = `__MERMAID_${mermaidIndex}__`;
    special.push({
      type: 'mermaid',
      data: { content: match[1].trim() },
      placeholder,
    });
    processed = processed.replace(match[0], placeholder);
    mermaidIndex++;
  }

  // Extract chart references: ![alt](path.chart.csv)
  const chartRegex = /!\[([^\]]*)\]\(([^)]*\.chart\.(csv|json))\)/g;
  let chartIndex = 0;
  while ((match = chartRegex.exec(markdown)) !== null) {
    const placeholder = `__CHART_${chartIndex}__`;
    const chartType = match[1].trim() || null; // Alt text can specify chart type
    special.push({
      type: 'chart',
      data: { src: match[2], chartType },
      placeholder,
    });
    processed = processed.replace(match[0], placeholder);
    chartIndex++;
  }

  return { markdown: processed, special };
}

/**
 * Convert markdown string to ProseMirror document
 */
export function markdownToProseMirror(markdown: string): ProseMirrorNode {
  try {
    // Pre-process to extract special blocks
    const { markdown: processed, special } = preprocessMarkdown(markdown);

    // Parse the processed markdown
    let doc = markdownParser.parse(processed) || schema.node('doc', null, [schema.node('paragraph')]);

    // Replace placeholders with actual nodes
    if (special.length > 0) {
      const newContent: ProseMirrorNode[] = [];

      doc.forEach((node) => {
        // Check if this node contains a placeholder
        if (node.textContent) {
          let replaced = false;
          for (const item of special) {
            if (node.textContent.includes(item.placeholder)) {
              replaced = true;
              if (item.type === 'mermaid') {
                newContent.push(schema.node('mermaid', item.data));
              } else if (item.type === 'chart') {
                newContent.push(schema.node('chart', item.data));
              }
              break;
            }
          }
          if (!replaced) {
            newContent.push(node);
          }
        } else {
          newContent.push(node);
        }
      });

      if (newContent.length > 0) {
        doc = schema.node('doc', null, newContent);
      }
    }

    return doc;
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
    return markdownSerializer.serialize(doc, { tightLists: true });
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
