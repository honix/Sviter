// Example 1: Stateless view - no data, just interactive UI
// This view doesn't use pagePath - it's a standalone component

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Simple Counter</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4">
          A stateless view example. No data file needed.
        </p>
        <div className="flex items-center gap-4">
          <Button onClick={() => setCount(c => c - 1)}>-</Button>
          <Badge variant="secondary" className="text-lg px-4 py-1">{count}</Badge>
          <Button onClick={() => setCount(c => c + 1)}>+</Button>
        </div>
      </CardContent>
    </Card>
  );
}
