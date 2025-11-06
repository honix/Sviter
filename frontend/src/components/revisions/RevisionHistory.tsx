import { useEffect, useState } from 'react';
import { PageRevision } from '../../types/page';
import { fetchPageHistory } from '../../services/api';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Clock, User, GitCommit } from 'lucide-react';

interface RevisionHistoryProps {
  pageTitle: string;
  onRevisionSelect: (revision: PageRevision) => void;
  onRestoreRevision?: (revision: PageRevision) => void;
}

export function RevisionHistory({ pageTitle, onRevisionSelect, onRestoreRevision }: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<PageRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRevisionSha, setSelectedRevisionSha] = useState<string | null>(null);

  useEffect(() => {
    loadRevisions();
  }, [pageTitle]);

  const loadRevisions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPageHistory(pageTitle);
      setRevisions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load git history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  };

  const handleRevisionClick = (revision: PageRevision) => {
    setSelectedRevisionSha(revision.sha);
    onRevisionSelect(revision);
  };

  const handleRestoreClick = (revision: PageRevision, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRestoreRevision) {
      onRestoreRevision(revision);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading git history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-4">
        <div className="text-destructive">Error: {error}</div>
        <Button onClick={loadRevisions} variant="outline" size="sm">
          Retry
        </Button>
      </div>
    );
  }

  if (revisions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">No commits yet</div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-2">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GitCommit className="w-5 h-5" />
          Commit History
        </h3>
        {revisions.map((revision) => (
          <div
            key={revision.sha}
            className={`
              p-4 border rounded-lg cursor-pointer transition-colors
              ${selectedRevisionSha === revision.sha
                ? 'bg-accent border-accent-foreground'
                : 'hover:bg-accent/50'
              }
            `}
            onClick={() => handleRevisionClick(revision)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <code className="font-mono text-xs px-2 py-1 bg-muted rounded">
                  {revision.short_sha}
                </code>
                <span className="text-sm font-medium">
                  {revision.message}
                </span>
              </div>
              {onRestoreRevision && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleRestoreClick(revision, e)}
                  title="Restore this version"
                >
                  Restore
                </Button>
              )}
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <User className="w-3 h-3" />
                <span>{revision.author}</span>
              </div>

              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{formatDate(revision.date)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
