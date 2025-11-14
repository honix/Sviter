# Autonomous Wiki Agents - Design Document

## Executive Summary

This document describes the design of autonomous agents that scan and improve the wiki knowledge base. These agents run on schedule (with manual on-demand execution), analyze wiki content, and create pull requests for human review. The system is **fully git-native** with no additional database requirements beyond the existing git wiki repository.

**Key Design Principles**:
- ✅ **Git-Native**: No SQLite/Postgres database - everything stored in git
- ✅ **Scheduled + Manual Execution**: Cron-based scheduling with on-demand trigger
- ✅ **Tag-Based Status**: Use git tags (`review`, `approved`, `rejected`) to track PR state
- ✅ **Branch Scanning**: List open PRs by scanning branches matching `agent/*` pattern
- ✅ **All Changes Require Approval**: No auto-merge, humans approve every change
- ✅ **Simple Review UI**: Diff viewer + Approve/Reject buttons (no comments, no chat)
- ✅ **Built-in Agents Only (MVP)**: Custom agents in post-MVP phases

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

#### 3. Content Enrichment Agent

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

**Note**: The following agent types are considered for post-MVP:
- **Question Asker Agent**: Identifies documentation gaps (would require issue system)
- **Compliance Agent**: Detects sensitive data and policy violations

### Custom Agent Types (Post-MVP)

Custom agents will be supported in post-MVP phases. Users will be able to define custom agents by creating wiki pages with naming convention `Agent:<CustomAgentName>`.

---

## Agent Classes System

### Python Agent Classes (Hardcoded)

Instead of YAML configuration, agents are defined as Python classes with:
- **Agent prompt**: System prompt for the AI agent
- **Schedule**: Cron expression for scheduling
- **Enabled**: Boolean flag to enable/disable
- **Settings**: Agent-specific parameters as class attributes

### Global Configuration

```python
# agents/config.py

class GlobalAgentConfig:
    """System-wide agent settings"""

    enabled = True

    # Loop Control (prevents runaway agents)
    max_iterations = 15
    max_tools_per_iteration = 5
    timeout_seconds = 300

    # AI Model
    ai_model = "anthropic/claude-3-5-sonnet"
    temperature = 0.3
```

### Agent Class Example: Information Integrity Agent

```python
# agents/integrity_checker.py

class InformationIntegrityAgent:
    """Agent that ensures information accuracy and consistency"""

    schedule = "0 2 * * *"  # Daily at 2 AM
    enabled = True

    prompt = """
You are an Information Integrity Agent for a wiki system.

Your task:
1. Scan wiki pages for broken internal links and consistency issues
2. When you find issues:
   - Create a branch: agent/integrity-checker/{timestamp}
   - Fix the issues
   - Write a descriptive commit message
   - Tag the branch for review

Workflow:
1. create_branch("agent/integrity-checker/{timestamp}")
2. Use find_pages() to search the wiki
3. Use read_page() to check pages
4. Use edit_page() to fix issues
5. tag_branch_for_review()

Important:
- Focus only on broken links and integrity issues
- Do NOT make stylistic changes
- Say "AGENT_COMPLETE" when done

Begin your analysis.
    """
```

### Agent Class Example: Style Consistency Agent

```python
# agents/style_checker.py

class StyleConsistencyAgent:
    """Agent that maintains consistent formatting and structure"""

    schedule = "0 3 * * 0"  # Weekly on Sunday at 3 AM
    enabled = True

    prompt = """
You are a Style Consistency Agent for a wiki system.

Your task:
1. Scan wiki pages for formatting inconsistencies
2. Fix heading hierarchy issues (H1 → H2 → H3)
3. Clean up whitespace and formatting issues
4. Maintain professional tone

When you find issues:
   - Create a branch: agent/style-checker/{timestamp}
   - Fix the issues
   - Write a descriptive commit message
   - Tag the branch for review

Important:
- Keep changes focused on style only
- Do NOT change content meaning
- Say "AGENT_COMPLETE" when done

Begin your analysis.
    """
```

### Agent Class Example: Content Enrichment Agent

```python
# agents/content_enricher.py

class ContentEnrichmentAgent:
    """Agent that enhances content with additional context and connections"""

    schedule = "0 5 * * 2"  # Weekly on Tuesday at 5 AM
    enabled = True

    prompt = """
You are a Content Enrichment Agent for a wiki system.

Your task:
1. Scan wiki pages for enrichment opportunities
2. Find related pages that should link to each other
3. Add cross-references where appropriate
4. Add "See Also" sections to connect related content

When you find opportunities:
   - Create a branch: agent/enrichment/{timestamp}
   - Make changes
   - Write a descriptive commit message
   - Tag the branch for review

Important:
- Only add high-confidence connections
- Focus on adding value, not changing existing content
- Say "AGENT_COMPLETE" when done

Begin your analysis.
    """
```

### Agent Registration

All agents are registered in a central location:

```python
# agents/__init__.py

from .integrity_checker import InformationIntegrityAgent
from .style_checker import StyleConsistencyAgent
from .content_enricher import ContentEnrichmentAgent

REGISTERED_AGENTS = [
    InformationIntegrityAgent,
    StyleConsistencyAgent,
    ContentEnrichmentAgent,
]
```

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
2. Load agent class from agents module
   ↓
3. Validate agent configuration and check resource limits
   ↓
4. Create execution context (isolated state)
   ↓
5. Initialize AI agent with:
   - System prompt (from agent.prompt)
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

Agents have access to essential tools only:

- `read_page(title: str)` - Read a wiki page
- `find_pages(query: str)` - Search wiki pages
- `create_branch(name: str)` - Create new branch for changes
- `edit_page(title: str, content: str)` - Edit page (creates commit)
- `tag_branch_for_review()` - Tag current branch with 'review'

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

Each agent class defines its system prompt as a class attribute. The prompt is used directly at runtime without formatting:

```python
# Agents use their prompt directly
system_prompt = agent_class.prompt

# Initialize AI client with the prompt
client = AIClient(
    model=GlobalAgentConfig.ai_model,
    system_prompt=system_prompt,
    temperature=GlobalAgentConfig.temperature,
    tools=self._get_agent_tools(),
)
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

### Git-Native PR Model

**No database required** - PRs are tracked entirely through git branches and tags:

**Branch Naming Convention**:
```
agent/<agent-name>/<timestamp>

Examples:
- agent/integrity-checker/20250312-143022
- agent/style-checker/20250312-150433
```

**Status Tracking via Git Tags**:
```
review     → PR is ready for human review (agent finished)
approved   → PR approved by human (after review)
rejected   → PR rejected by human
```

**PR Discovery**:
- List all branches matching `agent/*` pattern
- Filter by tag = `review` to find pending PRs
- Use git log and diff to extract commit messages, changes, timestamps

**PR Information** (extracted from git):
- Branch name → Agent name + timestamp
- First commit message → PR title/description (agent writes descriptive commit)
- `git diff main...branch` → Changes preview
- `git log --stat` → Files changed, lines added/removed
- Git author → Agent name
- Commit timestamp → When PR was created

### Merge Request Workflow

```
1. Agent identifies issues
   ↓
2. Agent creates branch: agent/<agent-name>/<timestamp>
   ↓
3. Agent makes changes and commits with descriptive message
   ↓
4. Agent tags branch with 'review'
   ↓
5. UI scans for branches tagged 'review' → displays in pending queue
   ↓
6. Human reviewer sees:
   - Branch name (agent name + timestamp)
   - Commit message (agent's description)
   - Git diff (via git diff main...branch)
   - Files changed (via git log --stat)
   ↓
7. Reviewer decides:
   - [Approve] → Merge to main, tag branch 'approved', delete branch
   - [Reject] → Tag branch 'rejected', keep branch for reference
   ↓
8. If approved:
   git checkout main
   git merge agent/<name>/<timestamp> --no-ff
   git tag approved agent/<name>/<timestamp>
   git branch -d agent/<name>/<timestamp>
   ↓
9. If rejected:
   git tag rejected agent/<name>/<timestamp>
   # Branch preserved for audit trail
```

### Agent Commit Messages

Agents write detailed commit messages that serve as PR descriptions:

**Example Commit Message** (written by Integrity Agent):
```
Fix broken internal links in documentation section

Fixed 8 broken internal links pointing to renamed or deleted pages.

Pages modified:
- Getting Started Guide (3 links)
  * "Installation" → "Installation/Overview"
  * "Configuration" → "Configuration/Basic"
  * Removed link to deleted "Old Tutorials"

- API Reference (2 links)
  * "Authentication" → "Security/Authentication"
  * "Rate Limits" → "API/Rate-Limiting"

- Troubleshooting (3 links)
  * "Common Errors" → "Support/Common-Errors"
  * "FAQ" → "Support/FAQ"
  * "Contact Support" → "Support/Contact"

Impact: No content changes, only link corrections.
All new links verified to exist.

Agent: integrity-checker
Run: 20250312-020433
Pages analyzed: 127
Execution time: 45s
```

The UI parses this commit message to display PR information.

---

## Review Interface

### Simplified Git-Native Design

The review interface is minimal and git-focused:

#### Dashboard View

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 Agent PRs - Pending Review                 [Run Agent ▼]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔔 Pending Reviews (3)                                         │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ agent/integrity-checker/20250312-143022                   │ │
│  │ Fix broken links in documentation                         │ │
│  │ 2 hours ago • 3 pages • +24 -24 lines                     │ │
│  │ [Review]                                                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ agent/style-checker/20250312-150500                       │ │
│  │ Fix heading hierarchy in guides                           │ │
│  │ 45 min ago • 5 pages • +12 -8 lines                       │ │
│  │ [Review]                                                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  📊 Recent (Last 10)                                            │
│  ├─ ✅ agent/integrity-checker/20250312-020000 - Approved      │
│  ├─ ✅ agent/style-checker/20250311-140000 - Approved          │
│  ├─ ❌ agent/enrichment/20250311-100000 - Rejected            │
│  └─ ✅ agent/integrity-checker/20250310-020000 - Approved      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Data Sources** (all from git):
- Pending PRs: `git branch --list 'agent/*'` filtered by tag `review`
- Timestamp: Parse from branch name
- Agent name: Parse from branch name
- Commit message: `git log -1 --format=%s <branch>`
- Stats: `git diff --stat main...<branch>`
- Recent: `git branch -a` filtered by tags `approved` or `rejected`

#### PR Review View

```
┌─────────────────────────────────────────────────────────────────┐
│  agent/integrity-checker/20250312-143022            [✅] [❌]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📝 Commit Message                                              │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Fix broken internal links in documentation section       │ │
│  │                                                           │ │
│  │ Fixed 8 broken internal links pointing to renamed or     │ │
│  │ deleted pages.                                            │ │
│  │                                                           │ │
│  │ Pages modified:                                           │ │
│  │ - Getting Started Guide (3 links)                        │ │
│  │ - API Reference (2 links)                                │ │
│  │ - Troubleshooting (3 links)                              │ │
│  │                                                           │ │
│  │ Agent: integrity-checker                                 │ │
│  │ Run: 20250312-143022                                     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  📊 Changed Files                                               │
│  pages/getting-started-guide.md       +8 -6                     │
│  pages/api-reference.md               +4 -3                     │
│  pages/troubleshooting.md             +12 -15                   │
│                                                                 │
│  📝 Diff [Unified ▼]                                            │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ pages/getting-started-guide.md                            │ │
│  │ ─────────────────────────────────────────────────────────│ │
│  │ - See [[Installation]] for setup instructions.           │ │
│  │ + See [[Installation/Overview]] for setup instructions.  │ │
│  │                                                           │ │
│  │ - For configuration, see [[Configuration]].              │ │
│  │ + For configuration, see [[Configuration/Basic]].        │ │
│  │                                                           │ │
│  │ - Check out our [[Old Tutorials]] for examples.          │ │
│  │ + (removed - page deleted)                               │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  [✅ Approve & Merge]                           [❌ Reject]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Actions**:
- **Approve & Merge**: Merge branch to main, tag as `approved`, delete branch
- **Reject**: Tag branch as `rejected`, keep for reference

---

## Technical Architecture

### Backend Components

#### 1. Agent Scheduler Service

**File**: `backend/agents/scheduler.py`

```python
from .integrity_checker import InformationIntegrityAgent
from .style_checker import StyleConsistencyAgent
from .content_enricher import ContentEnrichmentAgent

class AgentScheduler:
    """
    Schedules and executes autonomous wiki agents.
    """

    REGISTERED_AGENTS = [
        InformationIntegrityAgent,
        StyleConsistencyAgent,
        ContentEnrichmentAgent,
    ]

    def __init__(self, wiki: GitWiki):
        self.wiki = wiki
        self.cron = CronScheduler()
        self.executor = AgentExecutor(wiki)
        self.state_manager = ExecutionStateManager()

    def load_agents(self):
        """Register all agent classes with cron scheduler"""
        for agent_class in self.REGISTERED_AGENTS:
            if agent_class.enabled:
                self.schedule_agent(agent_class)

    def schedule_agent(self, agent_class):
        """Schedule an agent class based on its cron expression"""
        # Parse cron schedule from agent_class.schedule
        # Register job with cron scheduler
        # Store in execution state

    def execute_agent(self, agent_class):
        """Execute a specific agent class"""
        # Create execution context
        # Run agent with loop control
        # Handle results (PRs, issues)
        # Log execution
        # Send notifications
```

#### 2. Agent Executor

**File**: `backend/agents/executor.py`

```python
from agents.config import GlobalAgentConfig

class AgentExecutor:
    """
    Executes individual agent runs with proper isolation and control.
    """

    def execute(self, agent_class) -> ExecutionResult:
        """Execute an agent class with full loop control"""

        # Create isolated execution context
        context = self._create_context(agent_class)

        # Initialize AI client with agent system prompt
        client = AIClient(
            model=GlobalAgentConfig.ai_model,
            system_prompt=agent_class.prompt,
            temperature=GlobalAgentConfig.temperature,
            tools=self._get_agent_tools(),
        )

        # Initialize loop controller
        loop_controller = AgentLoopController({
            'max_iterations': GlobalAgentConfig.max_iterations,
            'max_tools_per_iteration': GlobalAgentConfig.max_tools_per_iteration,
            'timeout_seconds': GlobalAgentConfig.timeout_seconds,
        })

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
            agent_name=agent_class.__name__,
            status='completed' if reason == 'natural_completion' else 'stopped',
            stop_reason=reason,
            iterations=iteration,
            prs_created=context.prs_created,
            pages_analyzed=len(context.pages_analyzed),
            execution_time=time.time() - context.start_time,
            logs=context.logs
        )
```

#### 3. PR Management (Git-Native)

**File**: `backend/agents/pr_manager.py`

All PR management done via git operations - no database needed. See "Git Operations for PR Management" section earlier for the `GitPRManager` implementation.

#### 4. Issue Tracking Service (Post-MVP)

Issue tracking will be added in post-MVP phases to support agents like Question Asker that identify documentation gaps. Issues could be implemented as markdown files in an `issues/` directory within the git repository.

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
export function PRReview({ branch }: { branch: string }) {
  const { commitMsg, diff, loading } = usePRData(branch);

  const handleApprove = async () => {
    await api.approvePR(branch);
    navigate('/agents/dashboard');
  };

  const handleReject = async () => {
    await api.rejectPR(branch);
    navigate('/agents/dashboard');
  };

  return (
    <div className="pr-review">
      <h2>{branch}</h2>

      <section className="commit-message">
        <pre>{commitMsg}</pre>
      </section>

      <section className="diff">
        <DiffViewer diff={diff} />
      </section>

      <section className="actions">
        <Button onClick={handleApprove}>✅ Approve & Merge</Button>
        <Button onClick={handleReject}>❌ Reject</Button>
      </section>
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
          <h4>{file.path}</h4>
          <pre className="diff-content">{file.patch}</pre>
        </div>
      ))}
    </div>
  );
}
```

### Git Operations for PR Management

All PR data comes from git - no separate database needed:

```python
class GitPRManager:
    """Manage PRs using git branches and tags"""

    def list_pending_prs(self) -> List[Dict]:
        """List all pending PRs (branches tagged 'review')"""
        branches = self.repo.git.branch('--list', 'agent/*').split('\n')
        pending = []

        for branch in branches:
            branch = branch.strip()
            if not branch:
                continue

            # Check if tagged 'review'
            tags = self.repo.git.tag('--points-at', branch).split('\n')
            if 'review' in tags:
                # Extract PR info from git
                commit_msg = self.repo.git.log('-1', '--format=%s%n%n%b', branch)
                stats = self.repo.git.diff('--stat', f'main...{branch}')
                timestamp = self.repo.git.log('-1', '--format=%at', branch)

                pending.append({
                    'branch': branch,
                    'commit_message': commit_msg,
                    'stats': stats,
                    'timestamp': int(timestamp),
                })

        return pending

    def approve_and_merge(self, branch_name: str):
        """Approve and merge a PR"""
        # Merge to main
        self.repo.git.checkout('main')
        self.repo.git.merge(branch_name, no_ff=True)

        # Tag as approved
        self.repo.git.tag('approved', branch_name)

        # Delete branch
        self.repo.git.branch('-d', branch_name)

    def reject_pr(self, branch_name: str):
        """Reject a PR"""
        # Tag as rejected (keep branch for audit)
        self.repo.git.tag('rejected', branch_name)
```

### WebSocket Events

Simplified events for real-time updates:

```typescript
// Server → Client
{
  type: 'agent_pr_created',
  data: {
    branch: string,
    agent_name: string,
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
    status: 'completed' | 'error',
    branch_created: string | null,
  }
}

// Client → Server
{
  type: 'approve_pr',
  data: {
    branch: string,
  }
}

{
  type: 'reject_pr',
  data: {
    branch: string,
  }
}

{
  type: 'run_agent',
  data: {
    agent_name: string,
  }
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)

**Goal**: Basic agent infrastructure and git-native PR system

**Tasks**:
1. Git PR manager (branch scanning, tag-based status)
2. Agent scheduler service (cron-based + manual trigger)
3. Agent executor with loop control
4. Agent configuration loading from wiki pages (`Agent:*`)
5. Basic PR listing API (scan `agent/*` branches)

**Deliverables**:
- Agents can be scheduled and manually triggered
- Agents can create branches and tag them for review
- PR list endpoint returns pending PRs from git

**Testing**:
- Manual agent execution creates branches
- Tags applied correctly (`review`)
- Can list pending PRs via git operations

---

### Phase 2: Information Integrity Agent (Week 3)

**Goal**: First functional agent - link checker

**Tasks**:
1. Implement Information Integrity Agent
   - Broken link detection
   - Link fixing logic
   - Descriptive commit messages
2. Agent system prompt engineering
3. Tool implementations (`check_link_exists`, `extract_links`)
4. Basic web UI for PR review (approve/reject buttons)

**Deliverables**:
- Working link checker agent
- Creates branches with fixes
- Basic review interface showing diffs

**Testing**:
- Agent finds and fixes broken links
- Creates branches tagged `review`
- Approval merges to main, rejection tags `rejected`

---

### Phase 3: Review Interface (Week 4)

**Goal**: Simple, git-native review UI

**Tasks**:
1. PR dashboard component (list pending PRs)
2. Diff viewer component (unified diff from git)
3. Approve & Reject buttons with git operations
4. Real-time updates via WebSocket

**Deliverables**:
- Clean PR dashboard
- Diff viewer showing changes
- Working approve/reject workflow

**Testing**:
- Non-technical users can review PRs
- Diff viewer clear and readable
- Approve/reject operations work correctly

---

### Phase 4: Additional Agent Types (Week 5-6)

**Goal**: Expand agent capabilities

**Tasks**:
1. Style Consistency Agent
2. Content Enrichment Agent
3. Agent performance metrics (from git history)
4. Manual agent trigger UI

**Deliverables**:
- 3 total working agent types
- Performance dashboard (approval rates from git tags)
- "Run Agent Now" functionality

**Testing**:
- All agents execute successfully
- Create well-formatted PRs
- Performance metrics accurate

---

### Phase 5: Configuration (Week 7)

**Goal**: Make agents configurable via wiki

**Tasks**:
1. Configuration validation for agent wiki pages
2. Agent enable/disable per page (frontmatter)
3. Schedule editing UI
4. Global config page (`Agent:GlobalConfig`)

**Deliverables**:
- Agents fully configurable via wiki pages
- Schedule editor
- Per-page agent exclusions

**Testing**:
- Config changes apply on next run
- Schedule modifications work
- Page-level exclusions respected

---

### Phase 6: Polish & Production (Week 8)

**Goal**: Production-ready system

**Tasks**:
1. Error handling and recovery
2. Performance optimization
3. Security audit (agent sandbox, loop control)
4. User documentation
5. Console logging for agent execution

**Deliverables**:
- Production-ready MVP
- User guide for reviewing PRs
- Admin guide for configuring agents

**Testing**:
- Load testing (multiple agents, large wiki)
- Security testing (runaway agents, malicious prompts)
- User acceptance testing

**MVP Complete: 8-week timeline**

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
