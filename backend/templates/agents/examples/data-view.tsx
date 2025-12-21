// CSV data manipulation example - demonstrates useCSV hook
export default function DataView() {
  const tasks = useCSV('agents/examples/tasks.csv');

  if (!tasks.isLoaded) {
    return <Card><CardContent className="p-4">Loading...</CardContent></Card>;
  }

  const toggleComplete = (index) => {
    const current = tasks.rows[index].completed === 'true';
    tasks.updateCell(index, 'completed', String(!current));
  };

  const addTask = () => {
    tasks.addRow({ task: 'New task', completed: 'false' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Task List</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Task</TableHeader>
              <TableHeader>Done</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks.rows.map((row, i) => (
              <TableRow key={i}>
                <TableCell>{row.task}</TableCell>
                <TableCell>
                  <Button
                    variant={row.completed === 'true' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleComplete(i)}
                  >
                    {row.completed === 'true' ? '✓' : '○'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Button onClick={addTask} variant="outline" className="mt-4">
          Add Task
        </Button>
      </CardContent>
    </Card>
  );
}
