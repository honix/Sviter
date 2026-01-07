// Kanban board view template for *.kanban.csv files
// Demonstrates typed data views with useCSV for data, useState for drag state

export default function KanbanView({ pagePath }) {
  const tasks = useCSV(pagePath);
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const columns = ['todo', 'in-progress', 'review', 'done'];
  const columnLabels = {
    'todo': 'To Do',
    'in-progress': 'In Progress',
    'review': 'Review',
    'done': 'Done'
  };
  const columnColors = {
    'todo': 'bg-slate-100',
    'in-progress': 'bg-blue-50',
    'review': 'bg-amber-50',
    'done': 'bg-green-50'
  };

  if (!tasks.isLoaded) {
    return <Card><CardContent className="p-8 text-center">Loading tasks...</CardContent></Card>;
  }

  const getTasksByStatus = (status) => {
    return tasks.rows
      .map((row, index) => ({ ...row, _index: index }))
      .filter(row => row.status === status);
  };

  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, column) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(column);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e, newStatus) => {
    e.preventDefault();
    if (draggedTask && draggedTask.status !== newStatus) {
      tasks.updateCell(draggedTask._index, 'status', newStatus);
    }
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverColumn(null);
  };

  const addTask = () => {
    const title = prompt('Task title:');
    if (title) {
      tasks.addRow({
        title,
        description: '',
        status: 'todo',
        priority: 'medium'
      });
    }
  };

  const deleteTask = (index) => {
    if (confirm('Delete this task?')) {
      tasks.deleteRow(index);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'border-l-red-500';
      case 'medium': return 'border-l-amber-500';
      case 'low': return 'border-l-green-500';
      default: return 'border-l-slate-300';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Kanban Board</h1>
        <Button onClick={addTask}>+ Add Task</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {columns.map(column => (
          <div
            key={column}
            className={`rounded-lg p-3 min-h-[400px] transition-colors ${columnColors[column]} ${
              dragOverColumn === column ? 'ring-2 ring-blue-400' : ''
            }`}
            onDragOver={(e) => handleDragOver(e, column)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column)}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-slate-600">
                {columnLabels[column]}
              </h2>
              <Badge variant="secondary">{getTasksByStatus(column).length}</Badge>
            </div>

            <div className="space-y-2">
              {getTasksByStatus(column).map(task => (
                <Card
                  key={task._index}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task)}
                  onDragEnd={handleDragEnd}
                  className={`cursor-grab active:cursor-grabbing border-l-4 ${getPriorityColor(task.priority)} ${
                    draggedTask?._index === task._index ? 'opacity-50' : ''
                  }`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                        onClick={() => deleteTask(task._index)}
                      >
                        ×
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge
                        variant={task.priority === 'high' ? 'destructive' : 'outline'}
                        className="text-xs"
                      >
                        {task.priority}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-3 text-sm text-slate-500">
          Drag tasks between columns to change status. Tasks are saved automatically.
        </CardContent>
      </Card>
    </div>
  );
}
