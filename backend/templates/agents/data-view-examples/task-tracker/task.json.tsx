// View template for individual *.task.json files
// Used by task-tracker to render each task

export default function TaskView({ pagePath }) {
  const { content, setContent, isLoaded } = usePage(pagePath);

  if (!isLoaded) {
    return <div className="p-2 text-muted-foreground">Loading...</div>;
  }

  if (!content || content.trim() === '') {
    return <div className="p-2 text-muted-foreground">Empty task</div>;
  }

  let task;
  try {
    task = JSON.parse(content);
  } catch (e) {
    return <div className="p-2 text-destructive">Invalid JSON</div>;
  }

  const toggleDone = () => {
    setContent(JSON.stringify({ ...task, done: !task.done }, null, 2));
  };

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-card">
      <Button
        variant={task.done ? "default" : "outline"}
        size="sm"
        onClick={toggleDone}
        className="shrink-0"
      >
        {task.done ? '✓' : '○'}
      </Button>
      <span className={task.done ? 'line-through text-muted-foreground' : ''}>
        {task.title || 'Untitled'}
      </span>
      {task.priority && (
        <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'} className="ml-auto">
          {task.priority}
        </Badge>
      )}
    </div>
  );
}
