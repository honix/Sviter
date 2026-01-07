// Example 3: Folder-based view with useFolder and usePageActions
// Renders a task tracker that manages *.task.json files in a folder

export default function TaskTrackerView({ pagePath }) {
  const { content, isLoaded } = usePage(pagePath);
  const { createPage, deletePage } = usePageActions();
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Parse config to get tasks folder
  let config = {};
  if (isLoaded && content) {
    try {
      config = JSON.parse(content);
    } catch (e) {
      // Invalid JSON
    }
  }

  const tasksFolder = config.tasksFolder || '';

  // List all task files in the folder
  const { files: taskFiles, isLoaded: filesLoaded, refresh } = useFolder(tasksFolder, '*.task.json');

  // Load TaskView component for rendering individual tasks
  const TaskView = useComponent('agents/data-view-examples/task-tracker/task.json.tsx');

  if (!isLoaded) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading config...</CardContent></Card>;
  }

  if (!tasksFolder) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No tasks folder configured. Edit this file and add a "tasksFolder" field.
        </CardContent>
      </Card>
    );
  }

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;

    const id = Date.now();
    const taskPath = `${tasksFolder}${id}.task.json`;
    const taskContent = JSON.stringify({
      title: newTaskTitle.trim(),
      done: false,
      priority: 'medium',
      created: new Date().toISOString()
    }, null, 2);

    try {
      await createPage(taskPath, taskContent);
      setNewTaskTitle('');
      // Refresh file list after short delay
      setTimeout(refresh, 500);
    } catch (e) {
      console.error('Failed to create task:', e);
    }
  };

  const removeTask = async (taskPath) => {
    if (!confirm('Delete this task?')) return;
    try {
      await deletePage(taskPath);
      setTimeout(refresh, 500);
    } catch (e) {
      console.error('Failed to delete task:', e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{config.name || 'Task Tracker'}</span>
          <Badge variant="secondary">{taskFiles.length} tasks</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add task form */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTask()}
            placeholder="New task..."
            className="flex-1 px-3 py-2 border rounded-md bg-background"
          />
          <Button onClick={addTask}>Add</Button>
        </div>

        {/* Task list */}
        {!filesLoaded ? (
          <div className="text-center text-muted-foreground py-4">Loading tasks...</div>
        ) : taskFiles.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">
            No tasks yet. Add one above!
          </div>
        ) : !TaskView ? (
          <div className="text-center text-muted-foreground py-4">Loading task view...</div>
        ) : (
          <div className="space-y-2">
            {taskFiles.map(taskPath => (
              <div key={taskPath} className="flex items-center gap-2">
                <div className="flex-1">
                  <TaskView pagePath={taskPath} />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => removeTask(taskPath)}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Tasks stored in: <code>{tasksFolder}</code>
        </p>
      </CardContent>
    </Card>
  );
}
