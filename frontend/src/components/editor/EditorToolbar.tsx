import { useEffect, useReducer } from 'react';
import { EditorView } from 'prosemirror-view';
import type { Command } from 'prosemirror-state';
import { toggleMark, setBlockType } from 'prosemirror-commands';
import { wrapInList, liftListItem } from 'prosemirror-schema-list';
import {
  addRowAfter,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  isInTable,
} from 'prosemirror-tables';
import type { MarkType, NodeType } from 'prosemirror-model';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  CodeSquare,
  Minus,
  Table2,
  Trash2,
  ChevronDown,
  Rows3,
  Rows2,
  Columns3,
  Columns2,
} from 'lucide-react';
import { schema } from '../../editor/schema';

interface EditorToolbarProps {
  editorView: EditorView | null;
}

export function EditorToolbar({ editorView }: EditorToolbarProps) {
  // Use reducer to trigger re-renders when selection changes
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  // Listen to editor state changes to update toolbar
  useEffect(() => {
    if (!editorView) return;

    // Create a custom update handler that triggers re-render
    const handleUpdate = () => {
      forceUpdate();
    };

    // Listen to selection changes and document changes
    editorView.dom.addEventListener('mouseup', handleUpdate);
    editorView.dom.addEventListener('keyup', handleUpdate);
    editorView.dom.addEventListener('click', handleUpdate);

    return () => {
      editorView.dom.removeEventListener('mouseup', handleUpdate);
      editorView.dom.removeEventListener('keyup', handleUpdate);
      editorView.dom.removeEventListener('click', handleUpdate);
    };
  }, [editorView]);

  if (!editorView) return null;

  // Get current state for UI checks - updates when forceUpdate is called
  const state = editorView.state;

  // Check if a mark is active
  const isMarkActive = (markType: MarkType) => {
    const { from, $from, to, empty } = state.selection;
    if (empty) {
      return !!markType.isInSet(state.storedMarks || $from.marks());
    }
    return state.doc.rangeHasMark(from, to, markType);
  };

  // Check if a block type is active
  const isBlockActive = (nodeType: NodeType, attrs: Record<string, unknown> = {}) => {
    const { $from, to } = state.selection;
    let found = false;
    state.doc.nodesBetween($from.pos, to, (node) => {
      if (node.type === nodeType) {
        if (Object.keys(attrs).length === 0) {
          found = true;
        } else {
          found = Object.keys(attrs).every((key) => node.attrs[key as keyof typeof node.attrs] === attrs[key]);
        }
      }
    });
    return found;
  };

  // Execute a command - CRITICAL: Always use fresh state from view, not stale render-time state
  const runCommand = (command: Command) => {
    // Get the current state from the view (not the stale state from render time)
    const currentState = editorView.state;
    const result = command(currentState, editorView.dispatch, editorView);
    editorView.focus();
    return result;
  };

  // Toggle bold
  const handleBold = () => {
    runCommand(toggleMark(schema.marks.strong));
  };

  // Toggle italic
  const handleItalic = () => {
    runCommand(toggleMark(schema.marks.em));
  };

  // Toggle code
  const handleCode = () => {
    runCommand(toggleMark(schema.marks.code));
  };

  // Toggle heading level (if already heading, convert to paragraph)
  const handleHeading = (level: number) => {
    if (isBlockActive(schema.nodes.heading, { level })) {
      runCommand(setBlockType(schema.nodes.paragraph));
    } else {
      runCommand(setBlockType(schema.nodes.heading, { level }));
    }
  };

  // Toggle bullet list (if already in list, lift out)
  const handleBulletList = () => {
    if (isBlockActive(schema.nodes.bullet_list)) {
      runCommand(liftListItem(schema.nodes.list_item));
    } else {
      runCommand(wrapInList(schema.nodes.bullet_list));
    }
  };

  // Toggle ordered list (if already in list, lift out)
  const handleOrderedList = () => {
    if (isBlockActive(schema.nodes.ordered_list)) {
      runCommand(liftListItem(schema.nodes.list_item));
    } else {
      runCommand(wrapInList(schema.nodes.ordered_list));
    }
  };

  // Insert link
  const handleLink = () => {
    // Get fresh state at time of execution
    const currentState = editorView.state;
    const { from, to, empty } = currentState.selection;

    if (empty) {
      alert('Please select text to create a link');
      return;
    }

    const url = prompt('Enter URL:');
    if (url) {
      const mark = schema.marks.link.create({ href: url });
      editorView.dispatch(currentState.tr.addMark(from, to, mark));
      editorView.focus();
    }
  };

  // Toggle code block (if already code block, convert to paragraph)
  const handleCodeBlock = () => {
    if (isBlockActive(schema.nodes.code_block)) {
      runCommand(setBlockType(schema.nodes.paragraph));
    } else {
      runCommand(setBlockType(schema.nodes.code_block));
    }
  };

  // Insert horizontal rule
  const handleHorizontalRule = () => {
    const { tr } = state;
    const node = schema.nodes.horizontal_rule.create();
    editorView.dispatch(tr.replaceSelectionWith(node));
    editorView.focus();
  };

  // Insert a new 3x3 table with header row
  const handleInsertTable = () => {
    const currentState = editorView.state;
    const { tr } = currentState;

    // Create header cells
    const headerCells = [];
    for (let i = 0; i < 3; i++) {
      const cell = schema.nodes.table_header.createAndFill();
      if (cell) headerCells.push(cell);
    }

    // Create body cells
    const createBodyRow = () => {
      const cells = [];
      for (let i = 0; i < 3; i++) {
        const cell = schema.nodes.table_cell.createAndFill();
        if (cell) cells.push(cell);
      }
      return schema.nodes.table_row.create(null, cells);
    };

    const headerRow = schema.nodes.table_row.create(null, headerCells);
    const bodyRow1 = createBodyRow();
    const bodyRow2 = createBodyRow();

    const table = schema.nodes.table.create(null, [headerRow, bodyRow1, bodyRow2]);

    editorView.dispatch(tr.replaceSelectionWith(table));
    editorView.focus();
  };

  // Check if cursor is in a table
  const inTable = isInTable(state);

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 p-2 border-b border-border bg-background sticky top-0 z-10 flex-wrap">
        {/* Text formatting */}
        <ToolbarButton
          onClick={handleBold}
          active={isMarkActive(schema.marks.strong)}
          tooltip="Bold (Ctrl+B)"
          icon={<Bold className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={handleItalic}
          active={isMarkActive(schema.marks.em)}
          tooltip="Italic (Ctrl+I)"
          icon={<Italic className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={handleCode}
          active={isMarkActive(schema.marks.code)}
          tooltip="Inline Code (Ctrl+`)"
          icon={<Code className="h-4 w-4" />}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Headings */}
        <ToolbarButton
          onClick={() => handleHeading(1)}
          active={isBlockActive(schema.nodes.heading, { level: 1 })}
          tooltip="Heading 1"
          icon={<Heading1 className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => handleHeading(2)}
          active={isBlockActive(schema.nodes.heading, { level: 2 })}
          tooltip="Heading 2"
          icon={<Heading2 className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => handleHeading(3)}
          active={isBlockActive(schema.nodes.heading, { level: 3 })}
          tooltip="Heading 3"
          icon={<Heading3 className="h-4 w-4" />}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Lists */}
        <ToolbarButton
          onClick={handleBulletList}
          active={isBlockActive(schema.nodes.bullet_list)}
          tooltip="Bullet List"
          icon={<List className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={handleOrderedList}
          active={isBlockActive(schema.nodes.ordered_list)}
          tooltip="Numbered List"
          icon={<ListOrdered className="h-4 w-4" />}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Other */}
        <ToolbarButton
          onClick={handleLink}
          active={isMarkActive(schema.marks.link)}
          tooltip="Insert Link"
          icon={<LinkIcon className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={handleCodeBlock}
          active={isBlockActive(schema.nodes.code_block)}
          tooltip="Code Block"
          icon={<CodeSquare className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={handleHorizontalRule}
          active={false}
          tooltip="Horizontal Rule"
          icon={<Minus className="h-4 w-4" />}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Table controls */}
        <ToolbarButton
          onClick={handleInsertTable}
          active={false}
          tooltip="Insert Table"
          icon={<Table2 className="h-4 w-4" />}
        />

        {/* Edit Table dropdown - visible when cursor is in table */}
        {inTable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2 gap-1">
                Edit table
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => runCommand(addRowAfter)}>
                <Rows3 className="h-4 w-4 mr-2" />
                Add Row Below
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runCommand(addColumnAfter)}>
                <Columns3 className="h-4 w-4 mr-2" />
                Add Column Right
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => runCommand(deleteRow)}>
                <Rows2 className="h-4 w-4 mr-2" />
                Delete Row
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runCommand(deleteColumn)}>
                <Columns2 className="h-4 w-4 mr-2" />
                Delete Column
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => runCommand(deleteTable)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Table
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </TooltipProvider>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  active: boolean;
  tooltip: string;
  icon: React.ReactNode;
}

function ToolbarButton({ onClick, active, tooltip, icon }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={active ? 'default' : 'ghost'}
          size="sm"
          onClick={onClick}
          className="h-8 w-8 p-0"
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
