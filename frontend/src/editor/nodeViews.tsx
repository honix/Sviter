import { Node as ProseMirrorNode } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import type { NodeView } from 'prosemirror-view';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { MermaidDiagram } from '../components/visualizations/MermaidDiagram';
import { ChartViewer } from '../components/visualizations/ChartViewer';
import type { ChartType } from '../components/visualizations/ChartViewer';
import { getApiUrl, resolvePath } from '../utils/url';

/**
 * Helper to fetch CSV data from the wiki
 */
async function fetchCSVData(src: string, currentPagePath: string | null): Promise<string> {
  try {
    // Resolve relative path
    const resolvedPath = resolvePath(src, currentPagePath);
    const url = `${getApiUrl()}/api/assets/${encodeURIComponent(resolvedPath).replace(/%2F/g, '/')}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    return await response.text();
  } catch (error) {
    console.error('Error fetching CSV data:', error);
    throw error;
  }
}

/**
 * Mermaid NodeView - renders Mermaid diagrams
 */
export class MermaidNodeView implements NodeView {
  dom: HTMLElement;
  private root: Root;

  constructor(node: ProseMirrorNode) {
    this.dom = document.createElement('div');
    this.dom.className = 'mermaid-node-view';

    // Create React root and render component
    this.root = createRoot(this.dom);
    this.root.render(<MermaidDiagram chart={node.attrs.content} />);
  }

  update(node: ProseMirrorNode): boolean {
    // Only accept updates to the same node type
    if (node.type.name !== 'mermaid') return false;

    // Re-render with new content
    this.root.render(<MermaidDiagram chart={node.attrs.content} />);
    return true;
  }

  destroy(): void {
    this.root.unmount();
  }

  // Make node non-editable
  stopEvent(): boolean {
    return true;
  }
}

/**
 * Chart NodeView - renders charts from CSV data
 */
export class ChartNodeView implements NodeView {
  dom: HTMLElement;
  private root: Root;
  private currentPagePath: string | null;

  constructor(node: ProseMirrorNode, _view: EditorView, _getPos: () => number | undefined, currentPagePath: string | null) {
    this.currentPagePath = currentPagePath;
    this.dom = document.createElement('div');
    this.dom.className = 'chart-node-view';

    // Create React root
    this.root = createRoot(this.dom);

    // Load and render chart
    this.renderChart(node);
  }

  private async renderChart(node: ProseMirrorNode): Promise<void> {
    const { src, chartType } = node.attrs;

    // Render loading state
    this.root.render(
      <div className="flex items-center justify-center h-64 border rounded-md bg-muted/10">
        <p className="text-muted-foreground">Loading chart...</p>
      </div>
    );

    try {
      // Fetch CSV data
      const csvData = await fetchCSVData(src, this.currentPagePath);

      // Render chart
      this.root.render(
        <ChartViewer
          csvData={csvData}
          chartType={chartType as ChartType}
          title={src}
        />
      );
    } catch (error) {
      // Render error state
      this.root.render(
        <div className="border border-destructive rounded-md p-4 my-4 bg-destructive/10">
          <p className="text-sm text-destructive">
            <strong>Chart Error:</strong> {error instanceof Error ? error.message : 'Failed to load chart'}
          </p>
          <p className="text-xs mt-2 text-muted-foreground">Source: {src}</p>
        </div>
      );
    }
  }

  update(node: ProseMirrorNode): boolean {
    // Only accept updates to the same node type
    if (node.type.name !== 'chart') return false;

    // Re-render with new data
    this.renderChart(node);
    return true;
  }

  destroy(): void {
    this.root.unmount();
  }

  // Make node non-editable
  stopEvent(): boolean {
    return true;
  }
}

/**
 * Create nodeViews map for ProseMirror EditorView
 */
export function createNodeViews(currentPagePath: string | null) {
  return {
    mermaid: (node: ProseMirrorNode) => new MermaidNodeView(node),
    chart: (node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined) =>
      new ChartNodeView(node, view, getPos, currentPagePath),
  };
}
