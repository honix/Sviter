# Wiki Index

Quick reference for navigating this wiki. **Agents should read this first** when starting a task.

You can edit it but keep this page structure unchanged.

## Pages

(Add page entries here as the wiki grows)

## Folders

- **agents/** - Agent configuration and wiki metadata (this folder)
  - `index.md` - Navigation hub (you are here)
  - `data-views.md` - Reference for TSX views and CSV data
  - `examples/` - Working code examples
  - `components/` - Reusable TSX components

## Navigation Tips

1. Use `list_pages` to see all pages (sorted alphabetically)
2. Use `grep_pages` to search content across all pages
3. Use `glob_pages` to find pages by path pattern
4. Read this index first to understand wiki structure before making changes

## Adding New Pages

When creating a new page:
1. Use a descriptive filename (e.g., `api-reference.md`, `getting-started.md`)
2. Update this index.md to add a navigation entry
3. Pages are sorted alphabetically - add number prefixes if specific order is needed

## Creating Interactive Views

For TSX views or CSV data files, see [agents/data-views.md](page:agents/data-views.md) for:
- Available hooks (`useCSV`, `usePage`, `useComponent`)
- UI components (Button, Card, Table, etc.)
- Working examples in `agents/examples/`
