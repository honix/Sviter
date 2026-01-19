/**
 * MermaidNodeView - Custom NodeView for rendering mermaid diagrams
 *
 * In view mode: renders the mermaid diagram as SVG
 * In edit mode: shows raw code with ProseMirror's contentDOM
 */

import { Node as ProseMirrorNode } from 'prosemirror-model';
import type { NodeView } from 'prosemirror-view';
import { EditorView } from 'prosemirror-view';
import mermaid from 'mermaid';

// Initialize mermaid with secure settings for wiki content
let mermaidInitialized = false;

function initMermaid() {
  if (mermaidInitialized) return;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'default',
    fontFamily: 'inherit',
    // Disable max width constraints for all diagram types - render at natural size
    flowchart: { useMaxWidth: false },
    sequence: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
    journey: { useMaxWidth: false },
    timeline: { useMaxWidth: false },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false },
    er: { useMaxWidth: false },
    pie: { useMaxWidth: false },
    quadrantChart: { useMaxWidth: false },
    requirement: { useMaxWidth: false },
    mindmap: { useMaxWidth: false },
    gitGraph: { useMaxWidth: false },
    c4: { useMaxWidth: false },
    sankey: { useMaxWidth: false },
  });
  mermaidInitialized = true;
}

// Counter for unique IDs (mermaid requires unique IDs for each render)
let renderCounter = 0;

/**
 * Creates a NodeView factory function for code_block nodes
 * that renders mermaid diagrams in view mode
 */
export function createMermaidNodeView(getEditable: () => boolean) {
  return (node: ProseMirrorNode, view: EditorView, getPos: () => number | undefined): NodeView => {
    return new MermaidNodeViewImpl(node, view, getPos, getEditable);
  };
}

class MermaidNodeViewImpl implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement | null = null;

  private node: ProseMirrorNode;
  private getEditable: () => boolean;
  private diagramContainer: HTMLElement | null = null;

  constructor(
    node: ProseMirrorNode,
    _view: EditorView,
    _getPos: () => number | undefined,
    getEditable: () => boolean
  ) {
    this.node = node;
    this.getEditable = getEditable;

    // Create the main container
    this.dom = document.createElement('div');
    this.dom.className = 'mermaid-block';

    // Build the initial view
    this.render();
  }

  private isMermaid(): boolean {
    return this.node.attrs.params === 'mermaid';
  }

  private async render() {
    const editable = this.getEditable();
    const isMermaid = this.isMermaid();

    // Clear previous content
    this.dom.innerHTML = '';
    this.contentDOM = null;
    this.diagramContainer = null;

    if (isMermaid && !editable) {
      // View mode for mermaid: render the diagram
      this.dom.classList.add('mermaid-view-mode');
      this.dom.classList.remove('mermaid-edit-mode');

      this.diagramContainer = document.createElement('div');
      this.diagramContainer.className = 'mermaid-diagram';
      this.dom.appendChild(this.diagramContainer);

      await this.renderDiagram();
    } else {
      // Edit mode or non-mermaid code block: show editable code
      this.dom.classList.remove('mermaid-view-mode');
      this.dom.classList.add(isMermaid ? 'mermaid-edit-mode' : 'code-block-wrapper');

      // Create the pre/code structure
      const pre = document.createElement('pre');
      pre.setAttribute('data-language', this.node.attrs.params || '');

      const code = document.createElement('code');
      pre.appendChild(code);

      // This is where ProseMirror will manage the text content
      this.contentDOM = code;

      this.dom.appendChild(pre);

      // Add a label for mermaid blocks in edit mode
      if (isMermaid) {
        const label = document.createElement('span');
        label.className = 'mermaid-label';
        label.textContent = 'mermaid';
        pre.appendChild(label);
      }
    }
  }

  private async renderDiagram() {
    if (!this.diagramContainer) return;

    initMermaid();

    const code = this.node.textContent;
    const id = `mermaid-${++renderCounter}`;

    try {
      const { svg } = await mermaid.render(id, code);
      if (this.diagramContainer) {
        this.diagramContainer.innerHTML = svg;
      }
    } catch (error) {
      // Show error state for invalid syntax
      if (this.diagramContainer) {
        this.diagramContainer.innerHTML = '';
        this.diagramContainer.className = 'mermaid-diagram mermaid-error';

        const errorDiv = document.createElement('div');
        errorDiv.className = 'mermaid-error-content';

        const errorIcon = document.createElement('span');
        errorIcon.className = 'mermaid-error-icon';
        errorIcon.textContent = '⚠';

        const errorText = document.createElement('span');
        errorText.className = 'mermaid-error-text';
        errorText.textContent = 'Invalid mermaid syntax';

        const errorDetails = document.createElement('pre');
        errorDetails.className = 'mermaid-error-details';
        errorDetails.textContent = error instanceof Error ? error.message : String(error);

        errorDiv.appendChild(errorIcon);
        errorDiv.appendChild(errorText);
        this.diagramContainer.appendChild(errorDiv);
        this.diagramContainer.appendChild(errorDetails);
      }
    }
  }

  update(node: ProseMirrorNode): boolean {
    // Only update if it's still a code_block
    if (node.type.name !== this.node.type.name) {
      return false;
    }

    const oldIsMermaid = this.isMermaid();
    const oldEditable = this.getEditable();

    this.node = node;

    const newIsMermaid = this.isMermaid();
    const newEditable = this.getEditable();

    // If switching between mermaid and non-mermaid, or between edit/view modes, re-render
    if (oldIsMermaid !== newIsMermaid || oldEditable !== newEditable) {
      this.render();
      return true;
    }

    // If in view mode for mermaid, re-render the diagram
    if (newIsMermaid && !newEditable) {
      this.renderDiagram();
    }

    return true;
  }

  // Don't let the editor take over in mermaid view mode
  ignoreMutation(mutation: MutationRecord | { type: 'selection'; target: Node }): boolean {
    // Always ignore selection mutations
    if (mutation.type === 'selection') {
      return true;
    }
    // In edit mode with contentDOM, let ProseMirror handle mutations to contentDOM
    if (this.contentDOM) {
      return !this.contentDOM.contains(mutation.target);
    }
    // In view mode (no contentDOM), ignore all mutations
    return true;
  }

  selectNode(): void {
    this.dom.classList.add('ProseMirror-selectednode');
  }

  deselectNode(): void {
    this.dom.classList.remove('ProseMirror-selectednode');
  }

  destroy(): void {
    // Cleanup if needed
  }
}
