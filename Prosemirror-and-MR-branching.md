Simplified Incremental Plan

You're absolutely right - let's break this into small, shippable
increments:

Milestone 1: Basic Revision History (MVP - No branches yet)

Goal: Every save creates a revision. Users can view history.

- Add PageRevision table (just snapshot + metadata)
- Create revision on every edit
- Add "History" tab to view past versions
- Click revision → view that version (read-only)
- Value: Never lose work, can see what changed

Milestone 2: ProseMirror Editor (Better editing UX)

Goal: Replace textarea with rich text editor

- Integrate Tiptap/ProseMirror
- Basic formatting toolbar
- Still saves to main page (no branches)
- Store both ProseMirror JSON + markdown
- Value: Better editing experience

Milestone 3: Simple Branching (Draft system)

Goal: Edit in draft, then "publish" to main

- Add branch_name field to revisions
- "Create draft" button → edits go to draft branch
- "Publish draft" button → merges to main (simple overwrite)
- Value: Safe experimentation without breaking main

Milestone 4: Merge Requests (Review workflow)

Goal: Review before merge

- Add MergeRequest table
- "Create MR" instead of direct publish
- Approve/reject UI
- Value: Quality control, collaboration

Milestone 5: AI Integration (Agents create MRs)

Goal: AI uses the same workflow as humans

- AI creates branches for edits
- AI creates MRs
- AI can review MRs
- Value: Supervised AI editing
