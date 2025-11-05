import { EditorView } from 'prosemirror-view';
import { EditorState } from 'prosemirror-state';
import { toggleMark, setBlockType, wrapIn } from 'prosemirror-commands';
import { wrapInList, liftListItem } from 'prosemirror-schema-list';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
} from 'lucide-react';
import { schema } from '../../editor/schema';

interface EditorToolbarProps {
  editorView: EditorView | null;
}

export function EditorToolbar({ editorView }: EditorToolbarProps) {
  if (!editorView) return null;

  const state = editorView.state;

  // Check if a mark is active
  const isMarkActive = (markType: any) => {
    const { from, $from, to, empty } = state.selection;
    if (empty) {
      return !!markType.isInSet(state.storedMarks || $from.marks());
    }
    return state.doc.rangeHasMark(from, to, markType);
  };

  // Check if a block type is active
  const isBlockActive = (nodeType: any, attrs = {}) => {
    const { $from, to } = state.selection;
    let found = false;
    state.doc.nodesBetween($from.pos, to, (node) => {
      if (node.type === nodeType) {
        if (Object.keys(attrs).length === 0) {
          found = true;
        } else {
          found = Object.keys(attrs).every((key) => node.attrs[key] === attrs[key]);
        }
      }
    });
    return found;
  };

  // Execute a command
  const runCommand = (command: any) => {
    command(state, editorView.dispatch, editorView);
    editorView.focus();
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

  // Set heading level
  const handleHeading = (level: number) => {
    runCommand(setBlockType(schema.nodes.heading, { level }));
  };

  // Toggle bullet list
  const handleBulletList = () => {
    runCommand(wrapInList(schema.nodes.bullet_list));
  };

  // Toggle ordered list
  const handleOrderedList = () => {
    runCommand(wrapInList(schema.nodes.ordered_list));
  };

  // Insert link
  const handleLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      const mark = schema.marks.link.create({ href: url });
      const { from, to } = state.selection;
      editorView.dispatch(state.tr.addMark(from, to, mark));
      editorView.focus();
    }
  };

  // Insert code block
  const handleCodeBlock = () => {
    runCommand(setBlockType(schema.nodes.code_block));
  };

  // Insert horizontal rule
  const handleHorizontalRule = () => {
    const { tr } = state;
    const node = schema.nodes.horizontal_rule.create();
    editorView.dispatch(tr.replaceSelectionWith(node));
    editorView.focus();
  };

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
