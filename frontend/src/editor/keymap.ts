import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import { toggleMark, setBlockType } from 'prosemirror-commands';
import { wrapInList, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { schema } from './schema';

/**
 * Create custom keymap for the wiki editor
 * Provides keyboard shortcuts for formatting commands
 */
export function buildKeymap() {
  const keys: { [key: string]: any } = {};

  // Text formatting
  keys['Mod-b'] = toggleMark(schema.marks.strong);  // Bold: Ctrl/Cmd+B
  keys['Mod-i'] = toggleMark(schema.marks.em);      // Italic: Ctrl/Cmd+I
  keys['Mod-`'] = toggleMark(schema.marks.code);    // Inline code: Ctrl/Cmd+`

  // Headings
  keys['Shift-Ctrl-1'] = setBlockType(schema.nodes.heading, { level: 1 });
  keys['Shift-Ctrl-2'] = setBlockType(schema.nodes.heading, { level: 2 });
  keys['Shift-Ctrl-3'] = setBlockType(schema.nodes.heading, { level: 3 });

  // Paragraph
  keys['Mod-Alt-0'] = setBlockType(schema.nodes.paragraph);

  // Code block
  keys['Shift-Ctrl-\\'] = setBlockType(schema.nodes.code_block);

  // Lists
  keys['Shift-Ctrl-8'] = wrapInList(schema.nodes.bullet_list);
  keys['Shift-Ctrl-9'] = wrapInList(schema.nodes.ordered_list);

  // List item manipulation
  if (schema.nodes.list_item) {
    keys['Tab'] = sinkListItem(schema.nodes.list_item);
    keys['Shift-Tab'] = liftListItem(schema.nodes.list_item);
  }

  // History
  keys['Mod-z'] = undo;
  keys['Mod-y'] = redo;
  keys['Mod-Shift-z'] = redo;

  return keymap(keys);
}
