"""
Organic approval detection for collaborative threads.

Detects approval signals in messages like:
- "looks good", "lgtm", "👍", "approved"
- "@ai go ahead", "@ai apply it"
- Multiple participants agreeing
"""

import re
from typing import List, Set, Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class ApprovalType(Enum):
    """Types of approval signals."""
    POSITIVE = "positive"      # "looks good", "👍"
    GO_AHEAD = "go_ahead"      # "@ai go ahead", "apply it"
    NEGATIVE = "negative"      # "no", "wait", "hold on"
    NEUTRAL = "neutral"        # No clear signal


@dataclass
class ApprovalSignal:
    """Detected approval signal in a message."""
    type: ApprovalType
    confidence: float  # 0.0 - 1.0
    phrases: List[str]  # Which phrases matched


# Strong positive approval patterns
STRONG_POSITIVE_PATTERNS = [
    r'\blgtm\b',
    r'\blooks\s+good\b',
    r'\bapproved?\b',
    r'\bship\s+it\b',
    r'\bgo\s+ahead\b',
    r'\bdo\s+it\b',
    r'\bapply\s+(it|this|the\s+changes?)\b',
    r'\bmerge\s+(it|this)\b',
    r'\byes,?\s*(please|go|do)\b',
    r'\bagree[ds]?\b',
]

# Emoji approval patterns
EMOJI_POSITIVE_PATTERNS = [
    r'👍',
    r'✅',
    r'🎉',
    r'💯',
    r'\+1',
    r':thumbsup:',
    r':white_check_mark:',
]

# Weak positive patterns (need context)
WEAK_POSITIVE_PATTERNS = [
    r'\b(yeah|yep|yup|sure|ok|okay)\b',
    r'\bnice\b',
    r'\bgood\b',
    r'\bgreat\b',
]

# Negative/hold patterns
NEGATIVE_PATTERNS = [
    r'\bwait\b',
    r'\bhold\s*(on|up)?\b',
    r'\bnot?\s+yet\b',
    r'\bstop\b',
    r'\bdon\'?t\b',
    r'\bno\b',
    r'\bactually\b',
    r'\blet\s+me\s+(think|check)\b',
    r'👎',
    r'❌',
]

# AI address patterns (signals direct instruction to AI)
AI_ADDRESS_PATTERNS = [
    r'@ai\s+go\s+ahead',
    r'@ai\s+do\s+it',
    r'@ai\s+apply',
    r'@ai\s+yes',
    r'@ai\s+proceed',
]


def detect_approval(text: str) -> ApprovalSignal:
    """
    Detect approval signals in a message.

    Args:
        text: Message text to analyze

    Returns:
        ApprovalSignal with detected type and confidence
    """
    text_lower = text.lower().strip()
    matched_phrases = []

    # Check for negative signals first (higher priority)
    for pattern in NEGATIVE_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            matched_phrases.append(pattern)

    if matched_phrases:
        return ApprovalSignal(
            type=ApprovalType.NEGATIVE,
            confidence=0.8,
            phrases=matched_phrases
        )

    # Check for AI address patterns (explicit instruction)
    matched_phrases = []
    for pattern in AI_ADDRESS_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            matched_phrases.append(pattern)

    if matched_phrases:
        return ApprovalSignal(
            type=ApprovalType.GO_AHEAD,
            confidence=0.95,
            phrases=matched_phrases
        )

    # Check for strong positive signals
    matched_phrases = []
    for pattern in STRONG_POSITIVE_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            matched_phrases.append(pattern)

    if matched_phrases:
        return ApprovalSignal(
            type=ApprovalType.POSITIVE,
            confidence=0.9,
            phrases=matched_phrases
        )

    # Check emoji patterns
    for pattern in EMOJI_POSITIVE_PATTERNS:
        if re.search(pattern, text):  # Don't lowercase emojis
            matched_phrases.append(pattern)

    if matched_phrases:
        return ApprovalSignal(
            type=ApprovalType.POSITIVE,
            confidence=0.85,
            phrases=matched_phrases
        )

    # Check weak positive patterns
    for pattern in WEAK_POSITIVE_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            matched_phrases.append(pattern)

    if matched_phrases:
        return ApprovalSignal(
            type=ApprovalType.POSITIVE,
            confidence=0.5,  # Lower confidence, needs context
            phrases=matched_phrases
        )

    return ApprovalSignal(
        type=ApprovalType.NEUTRAL,
        confidence=0.0,
        phrases=[]
    )


def is_approval(text: str, threshold: float = 0.7) -> bool:
    """
    Quick check if text contains approval signal above threshold.

    Args:
        text: Message text
        threshold: Minimum confidence for positive result

    Returns:
        True if approval detected with sufficient confidence
    """
    signal = detect_approval(text)
    return signal.type == ApprovalType.POSITIVE and signal.confidence >= threshold


def is_go_ahead(text: str) -> bool:
    """Check if text contains explicit "go ahead" instruction to AI."""
    signal = detect_approval(text)
    return signal.type == ApprovalType.GO_AHEAD


def is_hold(text: str) -> bool:
    """Check if text contains hold/wait/negative signals."""
    signal = detect_approval(text)
    return signal.type == ApprovalType.NEGATIVE


@dataclass
class ConsensusResult:
    """Result of consensus detection across messages."""
    has_consensus: bool
    approval_count: int
    total_participants: int
    approvers: List[str]
    signals: List[Tuple[str, ApprovalSignal]]  # (user_id, signal)


def detect_consensus(
    messages: List[dict],
    participant_ids: List[str],
    threshold: float = 0.5
) -> ConsensusResult:
    """
    Detect consensus across recent messages from participants.

    Args:
        messages: Recent messages with 'user_id' and 'content' fields
        participant_ids: List of participant user IDs
        threshold: Fraction of participants needed for consensus

    Returns:
        ConsensusResult with consensus status
    """
    # Track latest signal per participant
    participant_signals: dict = {}

    for msg in messages:
        user_id = msg.get('user_id')
        content = msg.get('content', '')

        if not user_id or user_id not in participant_ids:
            continue

        signal = detect_approval(content)
        if signal.type != ApprovalType.NEUTRAL:
            participant_signals[user_id] = signal

    # Count positive signals
    approvers = []
    signals = []

    for user_id, signal in participant_signals.items():
        signals.append((user_id, signal))
        if signal.type in (ApprovalType.POSITIVE, ApprovalType.GO_AHEAD):
            approvers.append(user_id)

    approval_count = len(approvers)
    total = len(participant_ids)

    # Consensus requires threshold fraction of participants
    # But at least 1 person must approve
    has_consensus = approval_count >= 1 and (approval_count / max(total, 1)) >= threshold

    return ConsensusResult(
        has_consensus=has_consensus,
        approval_count=approval_count,
        total_participants=total,
        approvers=approvers,
        signals=signals
    )
