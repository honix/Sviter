// Example 2: Data view template for *.user.json files
// Renders user profile data with live editing

export default function UserView({ pagePath }) {
  const { content, setContent, isLoaded } = usePage(pagePath);

  if (!isLoaded) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Loading...</CardContent></Card>;
  }

  if (!content || content.trim() === '') {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No user data. Edit the file to add JSON content.
        </CardContent>
      </Card>
    );
  }

  let user;
  try {
    user = JSON.parse(content);
  } catch (e) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-destructive">
          Invalid JSON: {e.message}
        </CardContent>
      </Card>
    );
  }

  const updateField = (field, value) => {
    const updated = { ...user, [field]: value };
    setContent(JSON.stringify(updated, null, 2));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
            {(user.name || '?')[0].toUpperCase()}
          </div>
          <div>
            <input
              type="text"
              value={user.name || ''}
              onChange={(e) => updateField('name', e.target.value)}
              className="text-xl font-bold bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary rounded px-1"
              placeholder="Name"
            />
            <p className="text-sm text-muted-foreground font-normal">{user.role || 'No role'}</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground">Email</label>
          <input
            type="email"
            value={user.email || ''}
            onChange={(e) => updateField('email', e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
            placeholder="email@example.com"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Role</label>
          <input
            type="text"
            value={user.role || ''}
            onChange={(e) => updateField('role', e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md bg-background"
            placeholder="Developer, Designer, etc."
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Bio</label>
          <textarea
            value={user.bio || ''}
            onChange={(e) => updateField('bio', e.target.value)}
            className="w-full mt-1 px-3 py-2 border rounded-md bg-background min-h-[80px]"
            placeholder="Tell us about yourself..."
          />
        </div>
        {user.tags && (
          <div className="flex gap-2 flex-wrap">
            {user.tags.map((tag, i) => (
              <Badge key={i} variant="secondary">{tag}</Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
