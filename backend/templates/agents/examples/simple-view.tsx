// Minimal TSX view example - demonstrates useState and UI components
export default function SimpleView() {
  const [count, setCount] = useState(0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Simple Counter</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <Button onClick={() => setCount(c => c - 1)}>-</Button>
          <Badge variant="secondary">{count}</Badge>
          <Button onClick={() => setCount(c => c + 1)}>+</Button>
        </div>
      </CardContent>
    </Card>
  );
}
