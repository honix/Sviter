/**
 * Runtime TSX compilation and execution using Sucrase.
 * Provides a sandboxed environment for user-defined views.
 * Supports component reuse via useComponent hook.
 */

import React, { useState, useEffect, useMemo, useCallback, memo, createContext, useContext, useRef } from 'react';
import type { ErrorInfo } from 'react';
import { transform } from 'sucrase';
import { useCSV } from '../../hooks/useCSV';
import type { DataRow, SaveStatus } from '../../hooks/useCSV';
import { usePage } from '../../hooks/usePage';
import { useAuth } from '../../contexts/AuthContext';
import type { CollabStatus } from '../editor/CollaborativeCodeMirrorEditor';

// UI components available in view scope
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

// Cache for compiled components (shared across all ViewRuntime instances)
const componentCache = new Map<string, {
  component: React.ComponentType<any> | null;
  error: Error | null;
  loading: boolean;
  promise: Promise<void> | null;
}>();

// Context for providing component loader to user views
interface ComponentRegistryContextValue {
  getComponent: (path: string) => React.ComponentType<any> | null;
  isLoading: (path: string) => boolean;
  getError: (path: string) => Error | null;
  loadComponent: (path: string) => void;
}

interface ViewRuntimeProps {
  /** TSX source code to compile and render */
  tsxCode: string;
  /** Path to the view file (for error context) */
  pagePath: string;
  /** Callback when compilation/runtime error occurs */
  onError?: (error: Error) => void;
  /** Additional props to pass to the view component */
  viewProps?: Record<string, any>;
  /** Callback for collab status changes (save status) */
  onCollabStatusChange?: (status: CollabStatus) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Context for tracking save status across multiple useCSV calls
interface SaveStatusContextValue {
  registerStatus: (id: string, status: SaveStatus) => void;
  unregisterStatus: (id: string) => void;
}

const SaveStatusContext = createContext<SaveStatusContextValue | null>(null);
const ComponentRegistryContext = createContext<ComponentRegistryContextValue | null>(null);

/**
 * Compile TSX source code to a React component.
 * Uses the same compilation logic as the main ViewRuntime.
 */
function compileTSXToComponent(
  tsxCode: string,
  scope: Record<string, any>
): React.ComponentType<any> {
  const transformed = transform(tsxCode, {
    transforms: ['typescript', 'jsx', 'imports'],
    jsxRuntime: 'classic',
    jsxPragma: 'React.createElement',
    jsxFragmentPragma: 'React.Fragment',
  });

  const scopeKeys = Object.keys(scope);
  const scopeValues = Object.values(scope);

  const wrappedCode = `
    "use strict";
    const exports = {};
    const module = { exports: {} };
    ${transformed.code}
    if (exports.default) return exports.default;
    if (module.exports.default) return module.exports.default;
    if (Object.keys(module.exports).length > 0) return module.exports;
    return exports;
  `;

  const fn = new Function(...scopeKeys, wrappedCode);
  const result = fn(...scopeValues);

  if (typeof result === 'function') {
    return result;
  } else if (result && typeof result.default === 'function') {
    return result.default;
  }
  throw new Error('Component must export a React component as default export');
}

/**
 * Wrapper hook that tracks save status and reports to context.
 */
function useCSVWithStatus<T extends DataRow = DataRow>(
  pageId: string,
  initialHeaders?: string[]
) {
  const result = useCSV<T>(pageId, initialHeaders);
  const context = useContext(SaveStatusContext);
  const idRef = useRef(`${pageId}-${Math.random()}`);

  useEffect(() => {
    if (context) {
      context.registerStatus(idRef.current, result.saveStatus);
    }
    return () => {
      if (context) {
        context.unregisterStatus(idRef.current);
      }
    };
  }, [context, result.saveStatus]);

  return result;
}

/**
 * Hook for loading and using other TSX components.
 * Returns the component if loaded, null if loading, or throws if error.
 *
 * Usage in views:
 *   const DataTable = useComponent('components/DataTable.tsx');
 *   if (!DataTable) return <div>Loading...</div>;
 *   return <DataTable data={rows} />;
 */
function createUseComponentHook(forceUpdate: () => void) {
  return function useComponent(componentPath: string): React.ComponentType<any> | null {
    const registry = useContext(ComponentRegistryContext);

    useEffect(() => {
      if (registry) {
        registry.loadComponent(componentPath);
      }
    }, [componentPath, registry]);

    if (!registry) {
      console.warn('useComponent: ComponentRegistryContext not available');
      return null;
    }

    const error = registry.getError(componentPath);
    if (error) {
      throw error;
    }

    return registry.getComponent(componentPath);
  };
}

/**
 * Error boundary for catching runtime errors in user views.
 */
class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('View runtime error:', error, errorInfo);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
          <h3 className="text-lg font-semibold text-destructive mb-2">Runtime Error</h3>
          <pre className="text-sm text-destructive/80 overflow-auto whitespace-pre-wrap">
            {this.state.error?.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Create the scope object available to user views.
 * Includes React, hooks, UI components, useCSV, usePage, and useComponent.
 */
const createScope = (
  useCSVHook: typeof useCSV,
  usePageHook: typeof usePage,
  useComponentHook: (path: string) => React.ComponentType<any> | null
) => ({
  // React
  React,
  useState,
  useEffect,
  useMemo,
  useCallback,
  memo,
  useRef,

  // Auth hook (needed by useCSV)
  useAuth,

  // CSV data hook (wrapped to track save status)
  useCSV: useCSVHook,

  // Generic text page hook
  usePage: usePageHook,

  // Legacy alias for backwards compatibility
  useDataPage: useCSVHook,

  // Component loader hook (for reusing other TSX components)
  useComponent: useComponentHook,

  // UI components
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,

  // Basic HTML table components (for data display)
  Table: ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <table className={`w-full border-collapse ${className}`}>{children}</table>
  ),
  TableHead: ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <thead className={`bg-muted ${className}`}>{children}</thead>
  ),
  TableBody: ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <tbody className={className}>{children}</tbody>
  ),
  TableRow: ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <tr className={`border-b ${className}`}>{children}</tr>
  ),
  TableCell: ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <td className={`px-4 py-2 ${className}`}>{children}</td>
  ),
  TableHeader: ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <th className={`px-4 py-2 text-left font-medium ${className}`}>{children}</th>
  ),
});

/**
 * ViewRuntime component - compiles and renders TSX code at runtime.
 */
export const ViewRuntime: React.FC<ViewRuntimeProps> = ({
  tsxCode,
  pagePath,
  onError,
  viewProps = {},
  onCollabStatusChange,
}) => {
  const [Component, setComponent] = useState<React.ComponentType<any> | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [saveStatuses, setSaveStatuses] = useState<Map<string, SaveStatus>>(new Map());
  const [, forceUpdate] = useState({});
  // Track loaded components to trigger re-renders when they're loaded
  const [_loadedComponents, setLoadedComponents] = useState<Map<string, React.ComponentType<any> | null>>(new Map());
  void _loadedComponents; // Used to trigger re-renders

  // Create useComponent hook with forceUpdate
  const useComponentHook = useMemo(() => createUseComponentHook(() => forceUpdate({})), []);

  // Aggregate save status from all useCSV hooks
  const aggregatedSaveStatus = useMemo((): SaveStatus => {
    if (saveStatuses.size === 0) return 'saved';
    const statuses = Array.from(saveStatuses.values());
    if (statuses.includes('saving')) return 'saving';
    if (statuses.includes('dirty')) return 'dirty';
    return 'saved';
  }, [saveStatuses]);

  // Notify parent of save status changes
  useEffect(() => {
    if (onCollabStatusChange) {
      onCollabStatusChange({
        connectionStatus: 'connected',
        remoteUsers: [],
        saveStatus: aggregatedSaveStatus,
      });
    }
  }, [aggregatedSaveStatus, onCollabStatusChange]);

  // Context value for tracking save statuses
  const saveStatusContextValue = useMemo((): SaveStatusContextValue => ({
    registerStatus: (id: string, status: SaveStatus) => {
      setSaveStatuses(prev => {
        const next = new Map(prev);
        next.set(id, status);
        return next;
      });
    },
    unregisterStatus: (id: string) => {
      setSaveStatuses(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    },
  }), []);

  // Component registry context value for loading other TSX components
  const componentRegistryValue = useMemo((): ComponentRegistryContextValue => ({
    getComponent: (path: string) => {
      const cached = componentCache.get(path);
      return cached?.component || null;
    },
    isLoading: (path: string) => {
      const cached = componentCache.get(path);
      return cached?.loading || false;
    },
    getError: (path: string) => {
      const cached = componentCache.get(path);
      return cached?.error || null;
    },
    loadComponent: async (path: string) => {
      // Check if already cached or loading
      const existing = componentCache.get(path);
      if (existing) {
        return;
      }

      // Mark as loading
      componentCache.set(path, {
        component: null,
        error: null,
        loading: true,
        promise: null,
      });

      try {
        // Fetch the TSX source from API
        const response = await fetch(`http://localhost:8000/api/pages/${encodeURIComponent(path)}`);
        if (!response.ok) {
          throw new Error(`Failed to load component: ${path}`);
        }
        const page = await response.json();
        const tsxSource = page.content || '';

        // Compile the component using the same scope
        // Note: This creates a simplified scope for reusable components
        const componentScope = createScope(useCSVWithStatus, usePage, useComponentHook);
        const compiled = compileTSXToComponent(tsxSource, componentScope);

        componentCache.set(path, {
          component: compiled,
          error: null,
          loading: false,
          promise: null,
        });

        // Update local state to trigger re-render
        setLoadedComponents(prev => {
          const next = new Map(prev);
          next.set(path, compiled);
          return next;
        });

        console.log(`Loaded component: ${path}`);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error(`Failed to compile component ${path}:`, err);
        componentCache.set(path, {
          component: null,
          error: err,
          loading: false,
          promise: null,
        });

        // Update local state to trigger re-render
        setLoadedComponents(prev => {
          const next = new Map(prev);
          next.set(path, null);
          return next;
        });
      }
    },
  }), [useComponentHook]);

  useEffect(() => {
    if (!tsxCode.trim()) {
      setComponent(null);
      setError(null);
      return;
    }

    try {
      // Transform TSX to JS using Sucrase
      // Include 'imports' to convert ES modules to CommonJS
      const transformed = transform(tsxCode, {
        transforms: ['typescript', 'jsx', 'imports'],
        jsxRuntime: 'classic',
        jsxPragma: 'React.createElement',
        jsxFragmentPragma: 'React.Fragment',
      });

      // Create function from transformed code
      // Use the wrapped useCSV that tracks save status
      const scope = createScope(useCSVWithStatus, usePage, useComponentHook);
      const scopeKeys = Object.keys(scope);
      const scopeValues = Object.values(scope);

      // Wrap in function that returns the default export
      // Sucrase with 'imports' transform sets exports.default for default exports
      const wrappedCode = `
        "use strict";
        const exports = {};
        const module = { exports: {} };
        ${transformed.code}
        // Check exports.default first (Sucrase uses this for default exports)
        if (exports.default) return exports.default;
        if (module.exports.default) return module.exports.default;
        // Fall back to module.exports if it has properties
        if (Object.keys(module.exports).length > 0) return module.exports;
        return exports;
      `;

      // Create and execute function with scope
      const fn = new Function(...scopeKeys, wrappedCode);
      const result = fn(...scopeValues);

      if (typeof result === 'function') {
        setComponent(() => result);
        setError(null);
      } else if (result && typeof result.default === 'function') {
        setComponent(() => result.default);
        setError(null);
      } else {
        throw new Error('View must export a React component as default export');
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('View compilation error:', err);
      setError(err);
      setComponent(null);
      onError?.(err);
    }
  }, [tsxCode, onError, useComponentHook]);

  if (error) {
    return (
      <div className="p-4 border border-destructive rounded-lg bg-destructive/10">
        <h3 className="text-lg font-semibold text-destructive mb-2">Compilation Error</h3>
        <p className="text-sm text-muted-foreground mb-2">File: {pagePath}</p>
        <pre className="text-sm text-destructive/80 overflow-auto whitespace-pre-wrap p-2 bg-background rounded">
          {error.message}
        </pre>
      </div>
    );
  }

  if (!Component) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Loading view...
      </div>
    );
  }

  return (
    <ComponentRegistryContext.Provider value={componentRegistryValue}>
      <SaveStatusContext.Provider value={saveStatusContextValue}>
        <ViewErrorBoundary onError={onError}>
          <Component {...viewProps} />
        </ViewErrorBoundary>
      </SaveStatusContext.Provider>
    </ComponentRegistryContext.Provider>
  );
};

export default ViewRuntime;
