# Autonomous Wiki Agents - Design Document

## Executive Summary

This document describes the design of autonomous agents that scan and improve the wiki knowledge base. These agents run on schedule, analyze wiki content, and create pull requests (merge requests) for human review. The system is designed to be accessible to non-programmers through a friendly UI for review, discussion, and approval.

## Table of Contents

1. [Vision & Objectives](#vision--objectives)
2. [Agent Types](#agent-types)
3. [Configuration System](#configuration-system)
4. [Agent Execution Model](#agent-execution-model)
5. [Pull Request System](#pull-request-system)
6. [Review Interface](#review-interface)
7. [Technical Architecture](#technical-architecture)
8. [Implementation Phases](#implementation-phases)
9. [Security & Safety](#security--safety)

---

## Vision & Objectives

### Vision
Create a self-maintaining wiki where AI agents autonomously improve content quality, consistency, and completeness while keeping humans in control through a review workflow.

### Key Objectives

1. **Autonomous Maintenance**: Agents continuously scan and improve wiki content
2. **Human Oversight**: All changes reviewed and approved by humans
3. **Non-Programmer Friendly**: Review interface accessible to domain experts, not just developers
4. **Configurable Behavior**: Agent behavior controlled via wiki documents (no code changes needed)
5. **Scheduled Operations**: Predictable, scheduled execution (e.g., daily at 2 AM)
6. **Quality Improvement**: Focus on information integrity, consistency, and completeness

### Success Metrics

- **Agent Effectiveness**: % of agent PRs that get approved
- **Quality Improvement**: Reduction in broken links, style inconsistencies, outdated info
- **User Adoption**: % of users who regularly review and approve agent PRs
- **Time Savings**: Reduction in manual wiki maintenance time

---

## Agent Types

### Built-in Agent Types

#### 1. Information Integrity Agent

**Purpose**: Ensure information accuracy and consistency across the wiki.

**Checks**:
- **Broken Internal Links**: Find pages that link to non-existent pages
- **Duplicate Content**: Detect pages with similar/duplicate content
- **Outdated Timestamps**: Flag pages with references to old dates (e.g., "last updated 2 years ago")
- **Conflicting Information**: Detect contradictory statements across pages
- **Missing Required Fields**: Check for pages missing critical metadata

**Actions**:
- Create PRs to fix broken links
- Suggest merging duplicate pages
- Update outdated references
- Flag conflicts for human review (as issues)
- Add missing metadata

**Example Configuration** (from wiki page `Agent:IntegrityChecker`):
```yaml
agent_type: information_integrity
schedule: "0 2 * * *"  # Daily at 2 AM
enabled: true
settings:
  check_links: true
  check_duplicates: true
  duplicate_threshold: 0.85  # 85% similarity
  check_outdated_dates: true
  outdated_threshold_days: 365
  check_conflicts: true
  auto_fix_simple_issues: false  # Create PRs for all issues
```

#### 2. Style Consistency Agent

**Purpose**: Maintain consistent formatting, tone, and structure.

**Checks**:
- **Heading Hierarchy**: Ensure proper H1 → H2 → H3 structure
- **Formatting Consistency**: Check for consistent use of bold, italics, code blocks
- **Tone Analysis**: Detect inconsistent voice (formal vs informal)
- **Template Compliance**: Verify pages follow defined templates
- **Whitespace Issues**: Fix excessive blank lines, trailing spaces

**Actions**:
- Create PRs to fix formatting issues
- Suggest template usage for pages
- Normalize heading structures
- Clean up whitespace

**Example Configuration** (from wiki page `Agent:StyleChecker`):
```yaml
agent_type: style_consistency
schedule: "0 3 * * 0"  # Weekly on Sunday at 3 AM
enabled: true
settings:
  check_headings: true
  check_formatting: true
  check_tone: true
  tone_style: "professional"  # professional | casual | technical
  enforce_templates: true
  template_page: "Templates/PageTemplate"
  fix_whitespace: true
  create_pr_per_page: false  # Bundle multiple pages in one PR
```

#### 3. Question Asker Agent

**Purpose**: Identify gaps in documentation and ask clarifying questions.

**Checks**:
- **Incomplete Sections**: Find pages with "TODO" or placeholder text
- **Missing Context**: Detect technical terms without definitions
- **Unexplained Concepts**: Find concepts referenced but never explained
- **Missing Examples**: Identify explanations that would benefit from examples
- **Dead Ends**: Find pages with no outgoing links (isolated information)

**Actions**:
- Create **issues** (not PRs) with questions for humans to answer
- Suggest related pages that should be linked
- Propose section additions based on common queries

**Example Configuration** (from wiki page `Agent:QuestionAsker`):
```yaml
agent_type: question_asker
schedule: "0 4 * * 1"  # Weekly on Monday at 4 AM
enabled: true
settings:
  check_incomplete_sections: true
  check_missing_definitions: true
  check_missing_examples: true
  check_dead_ends: true
  min_page_age_days: 7  # Only check pages older than 7 days
  create_issues: true
  create_suggestion_prs: false
  max_issues_per_run: 10
```

#### 4. Content Enrichment Agent

**Purpose**: Enhance existing content with additional context and connections.

**Checks**:
- **Missing Cross-References**: Find related pages that should link to each other
- **Expandable Summaries**: Identify pages that need executive summaries
- **Missing Tags**: Suggest relevant tags based on content analysis
- **Citation Opportunities**: Find statements that should cite other wiki pages

**Actions**:
- Create PRs to add cross-references
- Add "See Also" sections
- Suggest tags
- Add internal citations

**Example Configuration** (from wiki page `Agent:ContentEnricher`):
```yaml
agent_type: content_enrichment
schedule: "0 5 * * 2"  # Weekly on Tuesday at 5 AM
enabled: true
settings:
  add_cross_references: true
  add_summaries: true
  suggest_tags: true
  add_citations: true
  min_confidence: 0.7  # Only suggest high-confidence changes
  max_changes_per_page: 5
```

#### 5. Compliance Agent

**Purpose**: Ensure wiki content meets organizational policies and standards.

**Checks**:
- **Sensitive Information**: Detect potential PII, API keys, secrets
- **Policy Compliance**: Check against defined policies (e.g., accessibility, legal)
- **License Compliance**: Verify proper attribution for external content
- **Restricted Terms**: Flag use of deprecated or prohibited terminology

**Actions**:
- Create **high-priority issues** for sensitive data (block publishing if needed)
- Create PRs to fix policy violations
- Add missing attributions
- Suggest alternative terminology

**Example Configuration** (from wiki page `Agent:Compliance`):
```yaml
agent_type: compliance
schedule: "0 * * * *"  # Every hour (high priority)
enabled: true
settings:
  check_sensitive_data: true
  check_policies: true
  policy_pages:
    - "Policies/Accessibility"
    - "Policies/LegalGuidelines"
  check_licenses: true
  check_terminology: true
  restricted_terms_page: "Policies/RestrictedTerminology"
  block_on_sensitive_data: true  # Create blocking issues
```

### Custom Agent Types

Users can define custom agents by creating wiki pages with specific naming conventions:

**Page Name Format**: `Agent:<CustomAgentName>`

**Configuration Structure**:
```yaml
agent_type: custom
name: "My Custom Agent"
description: "Description of what this agent does"
schedule: "0 6 * * 3"  # Weekly on Wednesday at 6 AM
enabled: true
prompt: |
  You are an AI agent tasked with improving the wiki.

  Your specific task is to: [CUSTOM INSTRUCTIONS]

  When you find issues:
  1. Create a branch named "agent/<agent-name>/<timestamp>"
  2. Make your changes
  3. Create a merge request with:
     - Clear title describing the change
     - Detailed description of what was changed and why
     - List of affected pages

  Focus on [SPECIFIC AREA] and ensure changes are conservative and safe.

tools:
  - read_page
  - edit_page
  - find_pages
  - create_branch
  - create_merge_request

settings:
  max_pages_per_run: 10
  max_changes_per_pr: 5
  require_human_approval: true
```

---

## Configuration System

### Configuration Hierarchy

1. **Global Config** (wiki page `Agent:GlobalConfig`):
   - System-wide settings
   - Default schedules
   - Resource limits
   - Execution windows

2. **Agent-Specific Config** (wiki pages `Agent:<AgentName>`):
   - Agent-specific settings
   - Override global defaults
   - Enable/disable individual agents

3. **Page-Level Directives** (frontmatter in regular pages):
   - Opt-out specific agents for specific pages
   - Page-specific constraints

### Global Configuration Example

**Wiki Page**: `Agent:GlobalConfig`

```yaml
# Global Agent Configuration

# Execution Settings
enabled: true
max_concurrent_agents: 3
execution_timeout_minutes: 30
max_iterations_per_agent: 20

# Resource Limits
max_prs_per_day: 20
max_issues_per_day: 50
max_api_calls_per_hour: 1000

# Execution Windows (prevent agents from running during peak hours)
execution_windows:
  - start: "00:00"
    end: "06:00"
    days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

# Default Schedule (if agent doesn't specify)
default_schedule: "0 2 * * *"  # Daily at 2 AM

# Notification Settings
notifications:
  slack_webhook: "https://hooks.slack.com/..."
  email_recipients: ["team@example.com"]
  notify_on_pr_creation: true
  notify_on_issue_creation: true
  notify_on_errors: true

# Loop Control (see Agentic-Loop-Control.md)
loop_control:
  max_iterations: 15
  max_tools_per_iteration: 5
  timeout_seconds: 300
  repetition_threshold: 3
  enable_progress_tracking: true

# Model Configuration
ai_model:
  primary: "anthropic/claude-3-5-sonnet"
  fallback: "openai/gpt-4"
  temperature: 0.3  # Conservative for agent tasks

# Safety Settings
safety:
  require_pr_for_edits: true  # Never directly edit, always create PR
  max_lines_changed_per_pr: 500
  require_human_review: true
  enable_rollback: true
  sensitive_pages:  # Pages that require extra scrutiny
    - "Policies/*"
    - "Security/*"
    - "Legal/*"
```

### Agent-Specific Configuration Example

**Wiki Page**: `Agent:IntegrityChecker`

```yaml
agent_type: information_integrity
enabled: true
schedule: "0 2 * * *"  # Daily at 2 AM
description: |
  Scans wiki pages for broken links, duplicate content, and
  outdated information. Creates PRs to fix issues.

settings:
  # Link checking
  check_links: true
  auto_fix_simple_links: true

  # Duplicate detection
  check_duplicates: true
  duplicate_threshold: 0.85
  duplicate_comparison_method: "semantic"  # semantic | exact | fuzzy

  # Outdated content
  check_outdated_dates: true
  outdated_threshold_days: 365

  # Conflict detection
  check_conflicts: true
  conflict_detection_scope: "semantic"  # semantic | exact

  # Metadata
  check_metadata: true
  required_fields:
    - title
    - author
    - tags

  # Behavior
  create_pr_per_issue: false  # Bundle multiple fixes in one PR
  max_pages_per_run: 50
  max_changes_per_pr: 10

  # Exclusions
  exclude_patterns:
    - "Archive/*"
    - "Drafts/*"
    - "Templates/*"

  # Prioritization
  priority_patterns:
    - "Documentation/*"
    - "Guides/*"

# Override global settings
ai_model:
  primary: "anthropic/claude-3-5-sonnet"
  temperature: 0.2  # Very conservative for integrity checks

notifications:
  notify_on_pr_creation: true
  priority: "normal"
```

### Page-Level Configuration (Frontmatter)

Individual wiki pages can opt-out or configure agent behavior:

```yaml
---
title: "My Important Page"
author: "John Doe"
tags: [documentation, important]

# Agent Configuration
agents:
  exclude:
    - StyleChecker  # Don't run style checker on this page
  settings:
    IntegrityChecker:
      skip_link_check: true  # This page intentionally has external-only links
    QuestionAsker:
      min_page_age_days: 30  # Wait longer before asking questions
---

# Page content here
```

### Configuration Validation

The system validates all agent configurations on:
1. **Agent startup**: Validate before running
2. **Config save**: Validate when user saves agent config pages
3. **Manual trigger**: `/api/agents/validate` endpoint

**Validation checks**:
- Required fields present
- Valid cron expressions
- Valid tool references
- Resource limits within bounds
- No circular dependencies

---

## Agent Execution Model

### Scheduler Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Agent Scheduler                        │
│                                                         │
│  ┌─────────────┐   ┌──────────────┐  ┌──────────────┐ │
│  │  Cron Jobs  │ → │ Agent Queue  │ → │  Executor   │ │
│  └─────────────┘   └──────────────┘  └──────────────┘ │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │           Execution State Manager               │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Execution Flow

```
1. Scheduler triggers agent (based on cron schedule)
   ↓
2. Load agent configuration from wiki
   ↓
3. Validate configuration and check resource limits
   ↓
4. Create execution context (isolated state)
   ↓
5. Initialize AI agent with:
   - System prompt (from config)
   - Available tools
   - Loop control parameters
   ↓
6. Agent execution begins:
   ┌─────────────────────────────────────────┐
   │  While not complete:                    │
   │    - Agent analyzes wiki content        │
   │    - Uses tools (read_page, find_pages) │
   │    - Identifies issues                  │
   │    - Plans fixes                        │
   │                                         │
   │  If issues found:                       │
   │    - Create branch                      │
   │    - Make changes                       │
   │    - Create PR or Issue                 │
   │                                         │
   │  Loop control checks each iteration     │
   └─────────────────────────────────────────┘
   ↓
7. Agent completes or times out
   ↓
8. Log execution results
   ↓
9. Send notifications
   ↓
10. Clean up execution context
```

### Agent Tools

Agents have access to specialized tools:

#### Core Wiki Tools
- `read_page(title: str)` - Read a wiki page
- `find_pages(query: str, limit: int)` - Search wiki pages
- `list_all_pages(limit: int)` - List all pages
- `get_page_metadata(title: str)` - Get page metadata only
- `get_page_history(title: str)` - Get revision history

#### Git Tools
- `get_current_branch()` - Get current branch name
- `list_branches()` - List all branches
- `create_branch(name: str, from_branch: str)` - Create new branch
- `checkout_branch(name: str)` - Switch branches

#### PR/Issue Tools
- `create_merge_request(title, description, source_branch, target_branch)` - Create PR
- `create_issue(title, description, priority, labels)` - Create issue
- `update_merge_request(mr_id, ...)` - Update existing PR
- `list_open_merge_requests()` - List open PRs
- `list_open_issues()` - List open issues

#### Edit Tools (PR Context Only)
- `edit_page(title: str, content: str)` - Edit page (creates commit in current branch)
- `create_page(title: str, content: str)` - Create new page
- `delete_page(title: str)` - Delete page

#### Analysis Tools
- `calculate_similarity(text1: str, text2: str)` - Calculate text similarity
- `extract_links(content: str)` - Extract all links from content
- `check_link_exists(title: str)` - Check if page exists
- `analyze_tone(content: str)` - Analyze writing tone
- `extract_concepts(content: str)` - Extract key concepts

### Loop Control Integration

Following the patterns from `Agentic-Loop-Control.md`, we implement multi-layered loop control:

```python
class AgentLoopController:
    """
    Loop control for autonomous wiki agents.
    Prevents infinite loops and runaway behavior.
    """

    def __init__(self, config: dict):
        self.max_iterations = config.get('max_iterations', 15)
        self.max_tools_per_iteration = config.get('max_tools_per_iteration', 5)
        self.timeout_seconds = config.get('timeout_seconds', 300)
        self.repetition_threshold = config.get('repetition_threshold', 3)

        self.start_time = time.time()
        self.tool_call_history = []
        self.pages_analyzed = set()
        self.changes_made = []

    def should_continue(self, iteration: int, tool_calls: list,
                       message_content: str) -> Tuple[bool, str]:
        """Check if agent should continue execution"""

        # Layer 1: Hard limits
        if iteration >= self.max_iterations:
            return False, "max_iterations_reached"

        if time.time() - self.start_time > self.timeout_seconds:
            return False, "timeout_exceeded"

        if len(tool_calls) > self.max_tools_per_iteration:
            return False, "too_many_tools_per_iteration"

        # Layer 2: Repetition detection
        if self._detect_repetitive_calls(tool_calls):
            return False, "repetitive_behavior_detected"

        # Layer 3: Explicit completion signals
        completion_signals = ["AGENT_COMPLETE", "TASK_DONE", "NO_MORE_ISSUES"]
        if any(signal in message_content.upper() for signal in completion_signals):
            return False, "explicit_completion_signal"

        # Layer 4: Natural completion
        if not tool_calls:
            return False, "natural_completion"

        # Layer 5: Resource exhaustion
        if len(self.pages_analyzed) > 100:
            return False, "page_analysis_limit_reached"

        return True, "continue"

    def _detect_repetitive_calls(self, current_tool_calls: list) -> bool:
        """Detect if agent is stuck in a loop"""
        for tool_call in current_tool_calls:
            signature = f"{tool_call['name']}:{json.dumps(tool_call['args'], sort_keys=True)}"
            recent = [t for t in self.tool_call_history[-5:] if t == signature]
            if len(recent) >= self.repetition_threshold:
                return True
        return False
```

### System Prompts for Agents

Each agent type has a specialized system prompt:

```python
INFORMATION_INTEGRITY_AGENT_PROMPT = """
You are an Information Integrity Agent for a wiki system.

Your responsibilities:
1. Scan wiki pages for integrity issues:
   - Broken internal links (links to non-existent pages)
   - Duplicate or near-duplicate content
   - Outdated information (references to old dates, deprecated info)
   - Conflicting information across pages
   - Missing required metadata

2. When you find issues:
   - Create a NEW BRANCH for your changes: agent/integrity-check/{timestamp}
   - Make surgical, precise fixes
   - Create a merge request with:
     * Clear title: "Fix: [Brief description]"
     * Detailed description of all changes
     * List of pages affected
   - Do NOT make stylistic changes (that's StyleAgent's job)

3. Important constraints:
   - ALWAYS use create_branch() before making any edits
   - ALWAYS create_merge_request() after making changes
   - Maximum {max_changes_per_pr} changes per PR
   - If you find more issues, create multiple PRs
   - Be conservative - when in doubt, create an ISSUE instead of a PR

4. Progress tracking:
   - State your progress: "Analyzed X pages, found Y issues"
   - When done, explicitly say "AGENT_COMPLETE"
   - If you find yourself repeating actions, STOP

5. Available tools:
   {tools_description}

Current configuration:
{agent_config}

Begin your analysis.
"""
```

### Execution Isolation

Each agent execution is isolated:

1. **Separate Git Branches**: Agents work on dedicated branches
2. **Resource Limits**: CPU, memory, API call limits
3. **Read-Only by Default**: Agents can only edit via PR workflow
4. **Audit Trail**: All agent actions logged
5. **Rollback Capability**: Easy to revert agent changes

---

## Pull Request System

### Data Model

```python
class MergeRequest(SQLAlchemyBase):
    """Merge Request (PR) for wiki changes"""

    id: int  # Primary key
    mr_number: int  # User-visible MR number (auto-increment)
    title: str
    description: str  # Markdown

    # Git references
    source_branch: str
    target_branch: str  # Usually 'main'

    # Status
    status: str  # 'open', 'approved', 'rejected', 'merged', 'closed'

    # Authorship
    author_type: str  # 'human', 'agent'
    author_id: str  # User ID or agent name
    agent_type: Optional[str]  # Agent type if author_type='agent'

    # Timestamps
    created_at: datetime
    updated_at: datetime
    merged_at: Optional[datetime]
    closed_at: Optional[datetime]

    # Review
    reviewer_id: Optional[str]
    review_comment: Optional[str]

    # Metadata
    labels: List[str]  # JSON array: ['agent-generated', 'integrity', 'urgent']
    priority: str  # 'low', 'normal', 'high', 'critical'

    # Changes summary
    files_changed: int
    lines_added: int
    lines_deleted: int
    pages_affected: List[str]  # JSON array of page titles

    # Relationships
    comments: List[MRComment]
    commits: List[str]  # Git commit SHAs


class MRComment(SQLAlchemyBase):
    """Comments on merge requests"""

    id: int
    mr_id: int
    author_id: str
    author_type: str  # 'human', 'agent'
    content: str  # Markdown
    created_at: datetime

    # Threading
    parent_comment_id: Optional[int]

    # Reactions
    reactions: Dict[str, int]  # {'thumbs_up': 5, 'heart': 2}


class Issue(SQLAlchemyBase):
    """Issues for questions and discussions"""

    id: int
    issue_number: int
    title: str
    description: str

    # Status
    status: str  # 'open', 'resolved', 'closed', 'wontfix'

    # Authorship
    author_type: str  # 'human', 'agent'
    author_id: str
    agent_type: Optional[str]

    # Timestamps
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]

    # Categorization
    labels: List[str]
    priority: str
    category: str  # 'question', 'inconsistency', 'missing-info', 'suggestion'

    # Related pages
    related_pages: List[str]

    # Relationships
    comments: List[IssueComment]
    linked_mrs: List[int]  # MRs that address this issue
```

### Merge Request Workflow

```
1. Agent identifies issues
   ↓
2. Agent creates branch: agent/{agent-name}/{timestamp}
   ↓
3. Agent makes changes and commits
   ↓
4. Agent creates MR via create_merge_request()
   ↓
5. MR appears in review queue (sorted by priority)
   ↓
6. Human reviewer sees:
   - Summary of changes
   - Diff view (side-by-side or unified)
   - Agent's reasoning
   - Affected pages
   ↓
7. Reviewer can:
   - Approve → Auto-merge to main
   - Request changes → Comment and reject
   - Edit → Make additional changes before merging
   - Reject → Close MR
   ↓
8. If approved:
   - Changes merged to main
   - Branch deleted (or archived)
   - Notifications sent
   ↓
9. If rejected:
   - MR closed
   - Feedback logged for agent training
   - Branch preserved for reference
```

### PR Auto-Generation

When an agent creates a PR, the system auto-generates:

1. **Diff Summary**: Files changed, lines added/removed
2. **Semantic Summary**: AI-generated summary of what changed
3. **Impact Analysis**: Which pages are affected, potential side effects
4. **Confidence Score**: Agent's confidence in the changes (0-100%)
5. **Preview Links**: Links to preview changed pages

Example PR Description (auto-generated):

```markdown
# Fix Broken Internal Links - Documentation Section

## Summary
Fixed 8 broken internal links in the documentation section that were pointing to renamed or deleted pages.

## Changes Made

### Pages Modified
- **Getting Started Guide** (3 link fixes)
  - Fixed link to "Installation" → "Installation/Overview"
  - Fixed link to "Configuration" → "Configuration/Basic"
  - Removed link to deleted page "Old Tutorials"

- **API Reference** (2 link fixes)
  - Fixed link to "Authentication" → "Security/Authentication"
  - Fixed link to "Rate Limits" → "API/Rate-Limiting"

- **Troubleshooting** (3 link fixes)
  - Fixed link to "Common Errors" → "Support/Common-Errors"
  - Fixed link to "FAQ" → "Support/FAQ"
  - Fixed link to "Contact Support" → "Support/Contact"

## Impact Analysis
- ✅ No breaking changes
- ✅ All new links verified to exist
- ✅ No content changes, only link updates
- 📊 Affected pages: 3
- 📊 Confidence: 95%

## Testing
- [x] Verified all new links exist
- [x] Checked for any cascading issues
- [x] Ran link checker on affected pages

## Preview
- [Preview: Getting Started Guide](#)
- [Preview: API Reference](#)
- [Preview: Troubleshooting](#)

---

**Agent**: Information Integrity Agent
**Run ID**: `integrity-20250312-020433`
**Execution Time**: 45 seconds
**Pages Analyzed**: 127
```

---

## Review Interface

### Non-Programmer Friendly Design

The review interface is designed for domain experts, not developers:

#### Dashboard View

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Agent Activity Dashboard                       [Settings ⚙️] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔔 Pending Reviews (8)                                         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 🔴 HIGH PRIORITY                                          │ │
│  │ MR #42: Fix Security Policy Compliance Issues            │ │
│  │ By: Compliance Agent • 2 hours ago                       │ │
│  │ 📄 3 pages • +45 -12 lines                               │ │
│  │ [Review Now]                                              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 🟡 NORMAL                                                 │ │
│  │ MR #41: Fix Broken Links in Documentation                │ │
│  │ By: Integrity Agent • 5 hours ago                        │ │
│  │ 📄 8 pages • +24 -24 lines                               │ │
│  │ [Review Now]                                              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  🎯 Recent Activity                                             │
│  ├─ ✅ MR #40: Style Consistency Fixes - Approved             │
│  ├─ ✅ MR #39: Add Cross References - Approved                │
│  ├─ ❌ MR #38: Rewrite Product Docs - Rejected               │
│  └─ ✅ Issue #12: Question about API versioning - Resolved    │
│                                                                 │
│  📊 Agent Performance (Last 30 Days)                            │
│  ├─ Integrity Agent:  85% approval rate (23 MRs)              │
│  ├─ Style Agent:      92% approval rate (18 MRs)              │
│  ├─ Question Agent:   12 issues created, 8 resolved           │
│  └─ Enrichment Agent: 78% approval rate (15 MRs)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### MR Review View (Side-by-Side)

```
┌─────────────────────────────────────────────────────────────────┐
│  MR #42: Fix Security Policy Compliance Issues                 │
├─────────────────────────────────────────────────────────────────┤
│  By: Compliance Agent  •  2 hours ago  •  🔴 High Priority    │
│  📄 3 pages changed  •  +45 -12 lines                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  💬 Agent's Explanation:                                        │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Found 3 pages with potential PII (Personally Identifiable│ │
│  │ Information) that should be redacted or moved to secure  │ │
│  │ storage. Changes made:                                   │ │
│  │                                                          │ │
│  │ 1. Removed email addresses from public examples         │ │
│  │ 2. Redacted API keys in code snippets                   │ │
│  │ 3. Added warnings about sensitive data handling         │ │
│  │                                                          │ │
│  │ Confidence: 98%                                          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  📝 Changes  [Diff View ▼]  [Preview ▼]                        │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Page: Security/API-Keys                                 │ │
│  │  ┌────────────────────┬────────────────────┐             │ │
│  │  │ Before (main)      │ After (this MR)    │             │ │
│  │  ├────────────────────┼────────────────────┤             │ │
│  │  │ Example usage:     │ Example usage:     │             │ │
│  │  │                    │                    │             │ │
│  │  │ ```                │ ```                │             │ │
│  │  │ api_key =          │ api_key =          │             │ │
│  │  │ "sk_live_abc123..." │ "sk_live_xxxx..." │  [Changed] │ │
│  │  │ ```                │ ```                │             │ │
│  │  │                    │                    │             │ │
│  │  │                    │ ⚠️ WARNING: Never  │  [Added]   │ │
│  │  │                    │ commit real API    │             │ │
│  │  │                    │ keys to docs!      │             │ │
│  │  └────────────────────┴────────────────────┘             │ │
│  │                                                          │ │
│  │  💬 Add comment to specific change...                    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  💬 Discussion (2)                                              │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  👤 Alice  •  1 hour ago                                  │ │
│  │  Should we also add a link to the secrets management     │ │
│  │  guide here?                                              │ │
│  │  └─ 🤖 Compliance Agent  •  50 min ago                    │ │
│  │     Good suggestion! I can add that in an updated MR.     │ │
│  │     [Reply]  👍 1                                          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [✅ Approve & Merge]  [✏️ Request Changes]  [❌ Reject]      │
│  [💬 Add Comment]      [👁️ Preview All Pages]                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Quick Actions Panel

```
┌─────────────────────────────────────┐
│  ⚡ Quick Actions                    │
├─────────────────────────────────────┤
│  👍 Approve All Low-Risk MRs        │
│     (3 pending)                     │
│                                     │
│  🔍 Review High Priority First      │
│     (1 pending)                     │
│                                     │
│  📊 View Agent Performance Report   │
│                                     │
│  ⚙️ Configure Agent Schedules       │
│                                     │
│  🔕 Pause All Agents (Maintenance)  │
│                                     │
│  📋 Export Activity Log             │
└─────────────────────────────────────┘
```

### Review Actions

#### Approve & Merge
- One-click approval for low-risk changes
- Optional: Add approval comment
- Auto-merge to main branch
- Send notifications

#### Request Changes
- Add comments to specific lines
- Agent can respond with clarifications or updated MR
- Keeps MR open until resolved

#### Edit Before Merging
- Make additional changes to the MR branch
- Useful for minor tweaks
- Then approve and merge

#### Reject
- Provide rejection reason
- Feedback logged for agent learning
- MR closed but preserved for reference

### Chat Integration in Review

Reviewers can chat with the agent that created the MR:

```
┌─────────────────────────────────────────────────────────────────┐
│  💬 Chat with Compliance Agent                                  │
├─────────────────────────────────────────────────────────────────┤
│  👤 You: Why did you redact the API key in the example but      │
│          not the webhook URL?                                   │
│                                                                 │
│  🤖 Agent: Good question! The webhook URL is a public endpoint  │
│           that doesn't require authentication, so it's safe to  │
│           share in documentation. The API key, however, grants  │
│           access to the account and must be kept secret. I can  │
│           add a note explaining this distinction if helpful.    │
│                                                                 │
│  👤 You: Yes, please add that clarification.                    │
│                                                                 │
│  🤖 Agent: Done! I've updated the MR with an explanation in the │
│           "Security Considerations" section. Would you like me  │
│           to review any other security-related pages?           │
│                                                                 │
│  [Type your message...]                          [Send]         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technical Architecture

### Backend Components

#### 1. Agent Scheduler Service

**File**: `backend/agents/scheduler.py`

```python
class AgentScheduler:
    """
    Schedules and executes autonomous wiki agents.
    """

    def __init__(self, wiki: GitWiki):
        self.wiki = wiki
        self.cron = CronScheduler()
        self.executor = AgentExecutor(wiki)
        self.state_manager = ExecutionStateManager()

    def load_agents(self):
        """Load agent configurations from wiki pages"""
        # Find all pages matching 'Agent:*'
        # Parse YAML configuration
        # Register with cron scheduler

    def schedule_agent(self, agent_config: dict):
        """Schedule an agent based on its cron expression"""
        # Parse cron schedule
        # Register job
        # Store in execution state

    def execute_agent(self, agent_name: str):
        """Execute a specific agent"""
        # Load config
        # Create execution context
        # Run agent with loop control
        # Handle results (PRs, issues)
        # Log execution
        # Send notifications
```

#### 2. Agent Executor

**File**: `backend/agents/executor.py`

```python
class AgentExecutor:
    """
    Executes individual agent runs with proper isolation and control.
    """

    def execute(self, agent_config: dict) -> ExecutionResult:
        """Execute an agent with full loop control"""

        # Create isolated execution context
        context = self._create_context(agent_config)

        # Initialize AI client with agent system prompt
        client = AIClient(
            model=agent_config['ai_model']['primary'],
            system_prompt=self._build_system_prompt(agent_config),
            tools=self._get_agent_tools(agent_config),
        )

        # Initialize loop controller
        loop_controller = AgentLoopController(agent_config['loop_control'])

        # Execute agent loop
        iteration = 0
        while True:
            # Get AI response
            response = client.chat(context.conversation_history)

            # Check loop control
            should_continue, reason = loop_controller.should_continue(
                iteration, response.tool_calls, response.content
            )

            if not should_continue:
                break

            # Process tool calls
            if response.tool_calls:
                for tool_call in response.tool_calls:
                    result = self._execute_tool(tool_call, context)
                    context.add_tool_result(tool_call.id, result)
                    loop_controller.record_tool_call(tool_call)

            iteration += 1

        # Return execution results
        return ExecutionResult(
            agent_name=agent_config['name'],
            status='completed' if reason == 'natural_completion' else 'stopped',
            stop_reason=reason,
            iterations=iteration,
            prs_created=context.prs_created,
            issues_created=context.issues_created,
            pages_analyzed=len(context.pages_analyzed),
            execution_time=time.time() - context.start_time,
            logs=context.logs
        )
```

#### 3. Merge Request Service

**File**: `backend/merge_requests/service.py`

```python
class MergeRequestService:
    """
    Manages merge requests (PRs) for wiki changes.
    """

    def create_mr(self,
                  title: str,
                  description: str,
                  source_branch: str,
                  target_branch: str = 'main',
                  author_type: str = 'agent',
                  author_id: str = None,
                  labels: List[str] = None,
                  priority: str = 'normal') -> MergeRequest:
        """Create a new merge request"""

        # Generate MR number
        mr_number = self._get_next_mr_number()

        # Calculate diff statistics
        diff_stats = self.wiki.get_diff_stats(source_branch, target_branch)

        # Extract affected pages
        affected_pages = self._extract_affected_pages(diff_stats)

        # Generate semantic summary
        semantic_summary = self._generate_semantic_summary(diff_stats)

        # Create MR record
        mr = MergeRequest(
            mr_number=mr_number,
            title=title,
            description=f"{description}\n\n---\n\n{semantic_summary}",
            source_branch=source_branch,
            target_branch=target_branch,
            author_type=author_type,
            author_id=author_id,
            labels=labels or [],
            priority=priority,
            status='open',
            files_changed=diff_stats['files_changed'],
            lines_added=diff_stats['lines_added'],
            lines_deleted=diff_stats['lines_deleted'],
            pages_affected=affected_pages,
            created_at=datetime.now()
        )

        # Save to database
        self.db.add(mr)
        self.db.commit()

        # Send notifications
        self._notify_mr_created(mr)

        return mr

    def approve_and_merge(self, mr_id: int, reviewer_id: str,
                         review_comment: str = None):
        """Approve and merge an MR"""

        mr = self.get_mr(mr_id)

        # Perform merge
        try:
            self.wiki.checkout_branch(mr.target_branch)
            self.wiki.repo.git.merge(mr.source_branch, no_ff=True)

            # Update MR status
            mr.status = 'merged'
            mr.reviewer_id = reviewer_id
            mr.review_comment = review_comment
            mr.merged_at = datetime.now()

            self.db.commit()

            # Clean up source branch (optional)
            if mr.source_branch.startswith('agent/'):
                self.wiki.repo.delete_head(mr.source_branch)

            # Send notifications
            self._notify_mr_merged(mr)

        except GitCommandError as e:
            raise MergeConflictError(f"Failed to merge: {e}")
```

#### 4. Issue Tracking Service

**File**: `backend/issues/service.py`

```python
class IssueService:
    """
    Manages issues created by agents or users.
    """

    def create_issue(self,
                     title: str,
                     description: str,
                     author_type: str,
                     author_id: str,
                     category: str = 'question',
                     priority: str = 'normal',
                     labels: List[str] = None,
                     related_pages: List[str] = None) -> Issue:
        """Create a new issue"""

        issue_number = self._get_next_issue_number()

        issue = Issue(
            issue_number=issue_number,
            title=title,
            description=description,
            author_type=author_type,
            author_id=author_id,
            category=category,
            priority=priority,
            labels=labels or [],
            related_pages=related_pages or [],
            status='open',
            created_at=datetime.now()
        )

        self.db.add(issue)
        self.db.commit()

        self._notify_issue_created(issue)

        return issue
```

### Frontend Components

#### 1. Agent Dashboard

**File**: `frontend/src/components/agents/AgentDashboard.tsx`

```typescript
export function AgentDashboard() {
  const { pendingMRs, recentActivity, agentStats } = useAgentData();

  return (
    <div className="agent-dashboard">
      <header>
        <h1>Agent Activity Dashboard</h1>
        <Button onClick={openSettings}>Settings</Button>
      </header>

      <section className="pending-reviews">
        <h2>Pending Reviews ({pendingMRs.length})</h2>
        {pendingMRs.map(mr => (
          <MRCard key={mr.id} mr={mr} />
        ))}
      </section>

      <section className="recent-activity">
        <h2>Recent Activity</h2>
        <ActivityTimeline activities={recentActivity} />
      </section>

      <section className="agent-performance">
        <h2>Agent Performance (Last 30 Days)</h2>
        <AgentStatsTable stats={agentStats} />
      </section>
    </div>
  );
}
```

#### 2. MR Review Interface

**File**: `frontend/src/components/merge-requests/MRReview.tsx`

```typescript
export function MRReview({ mrId }: { mrId: number }) {
  const { mr, diff, loading } = useMR(mrId);
  const [viewMode, setViewMode] = useState<'diff' | 'preview'>('diff');

  const handleApprove = async () => {
    await api.approveMR(mrId, reviewComment);
    toast.success('MR approved and merged!');
    navigate('/agents/dashboard');
  };

  return (
    <div className="mr-review">
      <MRHeader mr={mr} />

      <section className="agent-explanation">
        <h3>Agent's Explanation</h3>
        <Markdown>{mr.description}</Markdown>
      </section>

      <section className="changes">
        <div className="controls">
          <TabGroup value={viewMode} onChange={setViewMode}>
            <Tab value="diff">Diff View</Tab>
            <Tab value="preview">Preview</Tab>
          </TabGroup>
        </div>

        {viewMode === 'diff' ? (
          <DiffViewer diff={diff} />
        ) : (
          <PreviewPane mr={mr} />
        )}
      </section>

      <section className="discussion">
        <h3>Discussion</h3>
        <CommentThread comments={mr.comments} />
        <CommentInput onSubmit={handleAddComment} />
      </section>

      <section className="actions">
        <Button variant="success" onClick={handleApprove}>
          ✅ Approve & Merge
        </Button>
        <Button variant="warning" onClick={handleRequestChanges}>
          ✏️ Request Changes
        </Button>
        <Button variant="danger" onClick={handleReject}>
          ❌ Reject
        </Button>
      </section>

      {/* Chat with agent */}
      <AgentChatPanel agentId={mr.author_id} mrId={mrId} />
    </div>
  );
}
```

#### 3. Diff Viewer Component

**File**: `frontend/src/components/merge-requests/DiffViewer.tsx`

```typescript
export function DiffViewer({ diff }: { diff: Diff }) {
  return (
    <div className="diff-viewer">
      {diff.files.map(file => (
        <div key={file.path} className="file-diff">
          <div className="file-header">
            <h4>{file.path}</h4>
            <span className="stats">
              +{file.additions} -{file.deletions}
            </span>
          </div>

          <div className="diff-content">
            <SideBySideDiff
              before={file.before}
              after={file.after}
              hunks={file.hunks}
              onCommentLine={handleCommentOnLine}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Database Schema

```sql
-- Merge Requests
CREATE TABLE merge_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mr_number INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    source_branch TEXT NOT NULL,
    target_branch TEXT NOT NULL DEFAULT 'main',
    status TEXT NOT NULL DEFAULT 'open',
    author_type TEXT NOT NULL,
    author_id TEXT NOT NULL,
    agent_type TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    merged_at TIMESTAMP,
    closed_at TIMESTAMP,
    reviewer_id TEXT,
    review_comment TEXT,
    labels TEXT,  -- JSON array
    priority TEXT NOT NULL DEFAULT 'normal',
    files_changed INTEGER,
    lines_added INTEGER,
    lines_deleted INTEGER,
    pages_affected TEXT  -- JSON array
);

-- MR Comments
CREATE TABLE mr_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mr_id INTEGER NOT NULL,
    author_id TEXT NOT NULL,
    author_type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    parent_comment_id INTEGER,
    reactions TEXT,  -- JSON object
    FOREIGN KEY (mr_id) REFERENCES merge_requests(id),
    FOREIGN KEY (parent_comment_id) REFERENCES mr_comments(id)
);

-- Issues
CREATE TABLE issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_number INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    author_type TEXT NOT NULL,
    author_id TEXT NOT NULL,
    agent_type TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    labels TEXT,  -- JSON array
    priority TEXT NOT NULL DEFAULT 'normal',
    category TEXT NOT NULL,
    related_pages TEXT  -- JSON array
);

-- Issue Comments
CREATE TABLE issue_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_id INTEGER NOT NULL,
    author_id TEXT NOT NULL,
    author_type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    parent_comment_id INTEGER,
    reactions TEXT,  -- JSON object
    FOREIGN KEY (issue_id) REFERENCES issues(id),
    FOREIGN KEY (parent_comment_id) REFERENCES issue_comments(id)
);

-- Agent Execution Logs
CREATE TABLE agent_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_name TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    run_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    stop_reason TEXT,
    iterations INTEGER,
    prs_created INTEGER,
    issues_created INTEGER,
    pages_analyzed INTEGER,
    execution_time_seconds REAL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    error_message TEXT,
    logs TEXT  -- JSON array of log entries
);

-- Indexes for performance
CREATE INDEX idx_mr_status ON merge_requests(status);
CREATE INDEX idx_mr_author ON merge_requests(author_type, author_id);
CREATE INDEX idx_mr_created ON merge_requests(created_at DESC);
CREATE INDEX idx_issue_status ON issues(status);
CREATE INDEX idx_agent_exec_started ON agent_executions(started_at DESC);
```

### WebSocket Events

New WebSocket events for real-time updates:

```typescript
// Server → Client
{
  type: 'agent_mr_created',
  data: {
    mr: MergeRequest,
    agent_name: string,
  }
}

{
  type: 'agent_issue_created',
  data: {
    issue: Issue,
    agent_name: string,
  }
}

{
  type: 'mr_approved',
  data: {
    mr_id: number,
    reviewer_id: string,
  }
}

{
  type: 'agent_execution_started',
  data: {
    agent_name: string,
    run_id: string,
  }
}

{
  type: 'agent_execution_completed',
  data: {
    agent_name: string,
    run_id: string,
    result: ExecutionResult,
  }
}

// Client → Server
{
  type: 'approve_mr',
  data: {
    mr_id: number,
    review_comment: string,
  }
}

{
  type: 'reject_mr',
  data: {
    mr_id: number,
    reason: string,
  }
}

{
  type: 'chat_with_agent',
  data: {
    agent_id: string,
    mr_id: number,
    message: string,
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Basic agent infrastructure and PR system

**Tasks**:
1. Database schema for MRs and Issues
2. Agent scheduler service (cron-based)
3. Agent executor with loop control
4. Basic MR creation and listing APIs
5. Agent configuration loading from wiki pages

**Deliverables**:
- Agents can be scheduled and executed
- Agents can create branches and MRs
- Basic MR list view in UI

**Testing**:
- Manual agent execution works
- MRs appear in database
- Can list MRs via API

---

### Phase 2: Information Integrity Agent (Week 3)

**Goal**: First functional agent - link checker

**Tasks**:
1. Implement Information Integrity Agent
   - Broken link detection
   - Link fixing logic
2. Agent system prompt engineering
3. Tool implementations (check_link_exists, extract_links)
4. Basic MR review UI (approve/reject)

**Deliverables**:
- Working link checker agent
- Can create MRs for broken links
- Basic review workflow

**Testing**:
- Agent finds and fixes broken links
- Creates well-formatted MRs
- Approval/rejection works

---

### Phase 3: Review Interface (Week 4-5)

**Goal**: Non-programmer friendly review UI

**Tasks**:
1. Agent dashboard component
2. MR review interface with diff viewer
3. Side-by-side comparison view
4. Comment system for MRs
5. Approve/reject/request changes workflow

**Deliverables**:
- Complete review interface
- Diff viewer with syntax highlighting
- Comment threads on MRs

**Testing**:
- Non-technical users can review MRs
- Diff viewer is clear and readable
- Comments work properly

---

### Phase 4: Additional Agent Types (Week 6-7)

**Goal**: Expand agent capabilities

**Tasks**:
1. Style Consistency Agent
2. Question Asker Agent
3. Issue tracking system
4. Agent performance metrics
5. Agent chat interface for Q&A

**Deliverables**:
- 3 working agent types
- Issue creation and management
- Agent performance dashboard

**Testing**:
- All agents execute successfully
- Create appropriate MRs/issues
- Performance metrics accurate

---

### Phase 5: Configuration & Customization (Week 8)

**Goal**: Make agents configurable via wiki

**Tasks**:
1. Configuration validation
2. Agent enable/disable per page
3. Schedule customization UI
4. Custom agent creation docs
5. Global config page

**Deliverables**:
- Agents fully configurable via wiki
- Schedule editor UI
- Documentation for custom agents

**Testing**:
- Config changes apply correctly
- Schedule changes work
- Custom agents can be created

---

### Phase 6: Polish & Production (Week 9-10)

**Goal**: Production-ready system

**Tasks**:
1. Notification system (email, Slack)
2. Agent execution logs and debugging
3. Error handling and recovery
4. Performance optimization
5. Security audit
6. User documentation

**Deliverables**:
- Production-ready agent system
- Complete documentation
- Monitoring and alerts

**Testing**:
- Load testing (multiple agents, large wiki)
- Security testing
- User acceptance testing

---

## Security & Safety

### Safety Mechanisms

#### 1. Mandatory PR Workflow
- Agents NEVER edit main branch directly
- All changes go through PR review
- Humans have final approval

#### 2. Resource Limits
```python
# Per-agent limits
MAX_ITERATIONS = 20
MAX_PAGES_PER_RUN = 100
MAX_EDITS_PER_PR = 10
MAX_PRS_PER_DAY = 20

# System-wide limits
MAX_CONCURRENT_AGENTS = 3
MAX_API_CALLS_PER_HOUR = 1000
MAX_EXECUTION_TIME = 30 * 60  # 30 minutes
```

#### 3. Sensitive Page Protection
```yaml
# In Agent:GlobalConfig
safety:
  sensitive_pages:
    - "Policies/*"
    - "Security/*"
    - "Legal/*"
    - "Admin/*"

  require_human_approval_for_sensitive: true
  max_sensitive_changes_per_pr: 1
```

#### 4. Rollback Capability
- All MRs preserved even after merge
- Easy rollback via git
- Audit trail for all agent actions

#### 5. Circuit Breakers
- Agents auto-pause after repeated failures
- Notification sent to admins
- Manual restart required

#### 6. Sandboxing
- Agents run in isolated contexts
- Read-only access except via PRs
- No file system access outside wiki

### Monitoring & Alerts

```yaml
# Alert conditions
alerts:
  - condition: agent_failure_rate > 50%
    action: pause_agent
    notify: admin

  - condition: pr_rejection_rate > 80%
    action: pause_agent
    notify: admin
    message: "Agent creating low-quality PRs"

  - condition: execution_time > 25_minutes
    action: timeout_agent
    notify: admin

  - condition: sensitive_data_detected
    action: block_pr_creation
    notify: security_team
    priority: critical
```

### Audit Trail

Every agent action logged:
```python
{
  "timestamp": "2025-03-12T02:45:33Z",
  "agent_name": "IntegrityChecker",
  "run_id": "integrity-20250312-024533",
  "action": "create_mr",
  "details": {
    "mr_id": 42,
    "pages_changed": ["Getting-Started", "API-Docs"],
    "reason": "Fixed 2 broken links",
  },
  "duration_seconds": 45,
  "iterations": 8,
}
```

---

## Future Enhancements

### Phase 7+: Advanced Features

1. **Agent Learning**
   - Track approval/rejection patterns
   - Adjust agent behavior based on feedback
   - Personalized agents per team

2. **Collaborative Agents**
   - Multiple agents working together
   - Agent-to-agent communication
   - Specialized agent teams

3. **Predictive Maintenance**
   - Predict which pages will need updates
   - Proactive suggestions before issues arise
   - Trend analysis

4. **Integration Extensions**
   - GitHub/GitLab sync
   - Slack bot for reviews
   - Email digest of agent activity
   - API for external tools

5. **Advanced Analytics**
   - Wiki health score
   - Content quality metrics
   - Agent ROI calculations
   - User engagement tracking

---

## Conclusion

This design creates a self-maintaining wiki where autonomous agents continuously improve content quality while keeping humans firmly in control. The system is:

- **Accessible**: Non-programmers can review and approve changes
- **Safe**: All changes require human approval via PRs
- **Configurable**: Agents controlled via wiki pages, no code changes needed
- **Extensible**: Custom agents can be created easily
- **Reliable**: Loop control prevents runaway behavior

The phased implementation allows for incremental delivery of value, starting with a single agent type and gradually expanding capabilities.

**Next Steps**:
1. Review and approve this design
2. Begin Phase 1 implementation
3. Set up project tracking (issues/milestones)
4. Create technical specification documents for each component
