import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import { toggleMark, setBlockType, chainCommands } from 'prosemirror-commands';
import type { Command } from 'prosemirror-state';
import { wrapInList, liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { goToNextCell } from 'prosemirror-tables';
import { schema } from './schema';

/**
 * Create custom keymap for the wiki editor
 * Provides keyboard shortcuts for formatting commands
 */
export function buildKeymap() {
  const keys: Record<string, Command> = {};

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

  // List item manipulation + table cell navigation
  // Tab/Shift+Tab: try table navigation first, then list indentation
  if (schema.nodes.list_item) {
    keys['Enter'] = splitListItem(schema.nodes.list_item);
    keys['Tab'] = chainCommands(goToNextCell(1), sinkListItem(schema.nodes.list_item));
    keys['Shift-Tab'] = chainCommands(goToNextCell(-1), liftListItem(schema.nodes.list_item));
  } else {
    // If no list support, just use table navigation
    keys['Tab'] = goToNextCell(1);
    keys['Shift-Tab'] = goToNextCell(-1);
  }

  // History
  keys['Mod-z'] = undo;
  keys['Mod-y'] = redo;
  keys['Mod-Shift-z'] = redo;

  return keymap(keys);
}
