import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
}

// Initialize mermaid once
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  fontFamily: 'inherit',
});

export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [id] = useState(() => `mermaid-${Math.random().toString(36).substring(2, 11)}`);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!containerRef.current || !chart.trim()) return;

      try {
        setError(null);
        // Clear previous content
        containerRef.current.innerHTML = '';

        // Render the diagram
        const { svg } = await mermaid.render(id, chart.trim());
        containerRef.current.innerHTML = svg;
      } catch (err) {
        console.error('Mermaid rendering error:', err);
        setError(err instanceof Error ? err.message : 'Failed to render diagram');
      }
    };

    renderDiagram();
  }, [chart, id]);

  if (error) {
    return (
      <div className="border border-destructive rounded-md p-4 my-4 bg-destructive/10">
        <p className="text-sm text-destructive">
          <strong>Mermaid Error:</strong> {error}
        </p>
        <pre className="mt-2 text-xs overflow-x-auto">{chart}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-container flex justify-center items-center my-4 p-4 bg-muted/10 rounded-md overflow-x-auto"
    />
  );
}
