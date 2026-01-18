"""
@mentions parsing and resolution.

Extracts @mentions from messages and resolves them to user references.
"""

import re
from typing import List, Set, Tuple, Optional
from dataclasses import dataclass


# Special mentions
MENTION_AI = "ai"
MENTION_ALL = "all"
MENTION_HERE = "here"

# Maximum participants per thread to prevent spam
MAX_PARTICIPANTS_PER_THREAD = 50

# Pattern matches @username (alphanumeric, hyphen, underscore, dot)
MENTION_PATTERN = re.compile(r'@([a-zA-Z0-9_.-]+)')


@dataclass
class ParsedMentions:
    """Result of parsing @mentions from text."""
    user_mentions: List[str]  # @username mentions
    ai_mentioned: bool  # @ai was mentioned
    all_mentioned: bool  # @all was mentioned
    here_mentioned: bool  # @here was mentioned

    @property
    def has_mentions(self) -> bool:
        """Check if any mentions were found."""
        return bool(self.user_mentions) or self.ai_mentioned or self.all_mentioned or self.here_mentioned

    @property
    def addresses_ai(self) -> bool:
        """Check if AI is being addressed (directly or via @all)."""
        return self.ai_mentioned or self.all_mentioned


def parse_mentions(text: str) -> ParsedMentions:
    """
    Parse @mentions from text.

    Args:
        text: Message text to parse

    Returns:
        ParsedMentions with extracted mentions
    """
    matches = MENTION_PATTERN.findall(text)

    user_mentions = []
    ai_mentioned = False
    all_mentioned = False
    here_mentioned = False

    for match in matches:
        lower = match.lower()
        if lower == MENTION_AI:
            ai_mentioned = True
        elif lower == MENTION_ALL:
            all_mentioned = True
        elif lower == MENTION_HERE:
            here_mentioned = True
        else:
            # Regular user mention
            user_mentions.append(match)

    return ParsedMentions(
        user_mentions=user_mentions,
        ai_mentioned=ai_mentioned,
        all_mentioned=all_mentioned,
        here_mentioned=here_mentioned
    )


def extract_mentioned_users(text: str) -> Set[str]:
    """
    Extract unique user mentions from text (excludes @ai, @all, @here).

    Args:
        text: Message text

    Returns:
        Set of mentioned usernames
    """
    parsed = parse_mentions(text)
    return set(parsed.user_mentions)


def is_ai_addressed(text: str) -> bool:
    """
    Check if AI is being addressed in the message.

    Returns True if:
    - @ai is mentioned
    - @all is mentioned
    """
    parsed = parse_mentions(text)
    return parsed.addresses_ai


def is_direct_question(text: str) -> bool:
    """
    Check if text contains a direct question.

    Simple heuristic: ends with ? or contains question words near @ai.
    """
    text = text.strip()

    # Ends with question mark
    if text.endswith("?"):
        return True

    # Question words near @ai
    question_patterns = [
        r'@ai\s+(?:what|how|why|when|where|which|who|can|could|should|would|is|are|do|does)',
        r'(?:what|how|why|when|where|which|who|can|could|should|would)\s+.*@ai',
    ]

    for pattern in question_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return True

    return False


def format_mention(user_id_or_name: str) -> str:
    """Format a user ID or name as an @mention."""
    return f"@{user_id_or_name}"


def strip_mentions(text: str) -> str:
    """Remove all @mentions from text."""
    return MENTION_PATTERN.sub('', text).strip()


def resolve_mentions_to_user_ids(
    mentions: List[str],
    max_resolve: int = MAX_PARTICIPANTS_PER_THREAD
) -> List[str]:
    """
    Resolve @mention names/ids to actual user IDs.

    Looks up each mention in the users database - could be user ID or name.
    Uses targeted lookups instead of loading all users for better performance.

    Args:
        mentions: List of @mention strings (without @)
        max_resolve: Maximum number of mentions to resolve (prevents spam)

    Returns:
        List of resolved user IDs (excludes invalid mentions, limited to max_resolve)
    """
    from db import get_user, get_user_by_name

    resolved = []
    seen = set()

    # Limit input to prevent spam - only process first N mentions
    limited_mentions = mentions[:max_resolve] if len(mentions) > max_resolve else mentions

    for mention in limited_mentions:
        if len(resolved) >= max_resolve:
            break

        # Skip if already resolved
        if mention in seen:
            continue

        # Try direct ID match first (most common case)
        user = get_user(mention)
        if user and user['id'] not in seen:
            resolved.append(user['id'])
            seen.add(user['id'])
            continue

        # Try name match (case-insensitive)
        user = get_user_by_name(mention)
        if user and user['id'] not in seen:
            resolved.append(user['id'])
            seen.add(user['id'])

    return resolved
