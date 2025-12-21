// Reusable DataTable component - can be imported via useComponent
// Usage: const DataTable = useComponent('agents/components/DataTable.tsx');

export default function DataTable({
  title,
  headers,
  rows,
  onIncrement,
  onDecrement,
  valueColumn
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHead>
            <TableRow>
              {headers.map((header, i) => (
                <TableHeader key={i}>{header}</TableHeader>
              ))}
              {(onIncrement || onDecrement) && (
                <TableHeader>Actions</TableHeader>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {headers.map((header, colIndex) => {
                  const key = header.toLowerCase();
                  return (
                    <TableCell key={colIndex}>
                      {row[key] !== undefined ? String(row[key]) : ''}
                    </TableCell>
                  );
                })}
                {(onIncrement || onDecrement) && (
                  <TableCell>
                    <div className="flex gap-1">
                      {onDecrement && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDecrement(rowIndex)}
                        >
                          -
                        </Button>
                      )}
                      {onIncrement && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onIncrement(rowIndex)}
                        >
                          +
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-2">
          <Badge variant="secondary">{rows.length} items</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
