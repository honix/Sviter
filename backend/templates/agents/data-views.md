# Data Views Reference

The wiki supports **typed data views** - a system where data files are automatically rendered using matching view templates.

## How It Works

1. **Data files** use naming convention: `[name.]type.format` (e.g., `alice.user.json`, `board.kanban.csv`)
2. **View templates** match by type+format: `type.format.tsx` (e.g., `user.json.tsx`, `kanban.csv.tsx`)
3. When you open a data file, the system finds and renders the matching view template

| Data File | View Template | How It Works |
|-----------|---------------|--------------|
| `alice.user.json` | `user.json.tsx` | View receives `pagePath="alice.user.json"` |
| `board.kanban.csv` | `kanban.csv.tsx` | View receives `pagePath="board.kanban.csv"` |
| `myproject.task-tracker.json` | `task-tracker.json.tsx` | View receives `pagePath="myproject.task-tracker.json"` |

## File Types

| Extension | Purpose |
|-----------|---------|
| `.md` | Markdown pages |
| `.csv` | Tabular data |
| `.json` | Structured data |
| `.tsx` | Interactive views / view templates |

## Creating View Templates

View templates are React components that receive a `pagePath` prop pointing to the data file.

```tsx
// user.json.tsx - renders *.user.json files
export default function UserView({ pagePath }) {
  const { content, setContent, isLoaded } = usePage(pagePath);

  if (!isLoaded) return <div>Loading...</div>;
  if (!content) return <div>No data</div>;

  const user = JSON.parse(content);
  return <div>{user.name}</div>;
}
```

## Available Hooks

### Data Hooks

- **`usePage(pagePath)`** - Load any text file with live sync
  - Returns: `{ content, setContent, isLoaded }`
  - Use for: JSON, TXT, MD files

- **`useCSV(pagePath)`** - Load and edit CSV data
  - Returns: `{ rows, headers, updateCell, addRow, deleteRow, isLoaded }`
  - Use for: CSV files

- **`useFolder(folderPath, pattern?)`** - List files in a folder
  - Returns: `{ files, isLoaded, refresh }`
  - Use for: Collections of typed data files
  - Example: `useFolder('tasks/', '*.task.json')`

- **`usePageActions()`** - Create/delete pages
  - Returns: `{ createPage, deletePage }`
  - Use for: CRUD operations on typed data

- **`useComponent(path)`** - Load another TSX component
  - Returns: Component or null if loading
  - Use for: Nested/reusable views

### React Hooks

Standard React hooks: `useState`, `useEffect`, `useMemo`, `useCallback`, `memo`, `useRef`

## Available UI Components

- `Button` - Clickable button with variants
- `Card`, `CardContent`, `CardHeader`, `CardTitle` - Card layout
- `Badge` - Status/count badges
- `Table`, `TableHead`, `TableBody`, `TableRow`, `TableCell`, `TableHeader` - Table layout

## Examples

### 1. Stateless View (no data)

[data-view-examples/stateless/counter.tsx](data-view-examples/stateless/counter.tsx) - Simple counter, no pagePath needed

```tsx
export default function Counter() {
  const [count, setCount] = useState(0);
  return <Button onClick={() => setCount(c => c + 1)}>{count}</Button>;
}
```

### 2. Data View (single page)

[data-view-examples/user/user.json.tsx](data-view-examples/user/user.json.tsx) - View template for `*.user.json` files
[data-view-examples/user/alice.user.json](data-view-examples/user/alice.user.json) - Example data file

```tsx
export default function UserView({ pagePath }) {
  const { content, setContent } = usePage(pagePath);
  const user = JSON.parse(content);
  // Edit and save: setContent(JSON.stringify({...user, name: 'New'}))
}
```

### 3. Folder-Based Collection (CRUD)

[data-view-examples/task-tracker/task-tracker.json.tsx](data-view-examples/task-tracker/task-tracker.json.tsx) - Manages `*.task.json` files in a folder
[data-view-examples/task-tracker/myproject.task-tracker.json](data-view-examples/task-tracker/myproject.task-tracker.json) - Config pointing to tasks folder
[data-view-examples/task-tracker/task.json.tsx](data-view-examples/task-tracker/task.json.tsx) - View for individual tasks

```tsx
export default function TaskTracker({ pagePath }) {
  const { content } = usePage(pagePath);
  const config = JSON.parse(content);

  const { files } = useFolder(config.tasksFolder, '*.task.json');
  const { createPage, deletePage } = usePageActions();
  const TaskView = useComponent('task.json.tsx');

  // Render tasks, add/delete with createPage/deletePage
}
```

### 4. Kanban Board (CSV)

[data-view-examples/simple-kanban/kanban.csv.tsx](data-view-examples/simple-kanban/kanban.csv.tsx) - Drag-and-drop kanban board
[data-view-examples/simple-kanban/board.kanban.csv](data-view-examples/simple-kanban/board.kanban.csv) - Task data

## Tips

1. View templates (`*.*.tsx`) show source code when clicked - they render only when a matching data file is opened
2. Always check `isLoaded` before accessing data
3. CSV values are strings - parse numbers with `parseInt()`/`parseFloat()`
4. JSON parsing should be wrapped in try/catch for safety
5. Use `setContent(JSON.stringify(data, null, 2))` to save pretty-printed JSON
6. Tailwind CSS classes work for styling
