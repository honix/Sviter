"""
Slash command parsing for thread operations.

Parses user commands like:
- /thread auth-refactor @georg @lisa
- /approve
- /reject
"""

import re
from typing import Optional, List, Tuple
from dataclasses import dataclass
from enum import Enum


class CommandType(Enum):
    """Types of slash commands."""
    THREAD = "thread"     # Create new thread
    APPROVE = "approve"   # Approve changes (organic approval)
    REJECT = "reject"     # Reject changes
    HELP = "help"         # Request help
    UNKNOWN = "unknown"   # Unrecognized command


@dataclass
class ParsedCommand:
    """Result of parsing a slash command."""
    type: CommandType
    name: Optional[str] = None       # Thread name for /thread
    participants: List[str] = None   # @mentions for /thread
    message: Optional[str] = None    # Additional message/goal
    raw: str = ""                    # Original command text

    def __post_init__(self):
        if self.participants is None:
            self.participants = []


# Pattern for /command at start of message
COMMAND_PATTERN = re.compile(r'^/(\w+)(?:\s+(.*))?$', re.DOTALL)

# Pattern to extract @mentions
MENTION_PATTERN = re.compile(r'@([a-zA-Z0-9_-]+)')


def parse_command(text: str) -> Optional[ParsedCommand]:
    """
    Parse a slash command from text.

    Args:
        text: User message text

    Returns:
        ParsedCommand if text starts with /, None otherwise
    """
    text = text.strip()

    if not text.startswith('/'):
        return None

    match = COMMAND_PATTERN.match(text)
    if not match:
        return ParsedCommand(type=CommandType.UNKNOWN, raw=text)

    command = match.group(1).lower()
    args = match.group(2) or ""

    if command == "thread":
        return parse_thread_command(args, text)
    elif command == "approve":
        return ParsedCommand(type=CommandType.APPROVE, message=args.strip(), raw=text)
    elif command == "reject":
        return ParsedCommand(type=CommandType.REJECT, message=args.strip(), raw=text)
    elif command == "help":
        return ParsedCommand(type=CommandType.HELP, message=args.strip(), raw=text)
    else:
        return ParsedCommand(type=CommandType.UNKNOWN, raw=text)


def parse_thread_command(args: str, raw: str) -> ParsedCommand:
    """
    Parse /thread command arguments.

    Format: /thread <name> [@participant ...] [goal message]

    Examples:
        /thread auth-refactor @georg @lisa
        /thread fix-typos Let's clean up the docs
        /thread docs-update @ai help me improve the API docs
    """
    args = args.strip()

    if not args:
        return ParsedCommand(
            type=CommandType.THREAD,
            name=None,
            message="Please provide a thread name: /thread <name> [@participants]",
            raw=raw
        )

    parts = args.split()

    # First word is thread name
    name = parts[0]

    # Extract @mentions from remaining parts
    remaining = " ".join(parts[1:])
    mentions = MENTION_PATTERN.findall(remaining)

    # Filter out special mentions for participant list
    participants = [m for m in mentions if m.lower() not in ('ai', 'all', 'here')]

    # Get message (everything after mentions, or rest of the line)
    # Remove mentions from the message
    message = MENTION_PATTERN.sub('', remaining).strip()

    return ParsedCommand(
        type=CommandType.THREAD,
        name=name,
        participants=participants,
        message=message if message else None,
        raw=raw
    )


def is_command(text: str) -> bool:
    """Check if text starts with a slash command."""
    return text.strip().startswith('/')


def extract_command_and_message(text: str) -> Tuple[Optional[ParsedCommand], str]:
    """
    Extract command from text, return (command, remaining_message).

    If text starts with /, returns the parsed command and any message after.
    If text doesn't start with /, returns (None, original_text).
    """
    cmd = parse_command(text)
    if cmd is None:
        return None, text

    # For thread commands, the message is the goal
    return cmd, cmd.message or ""
