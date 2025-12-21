/**
 * Collaborative CSV table editor with Yjs backing.
 * Provides inline cell editing with real-time sync.
 */

import React, { useCallback, useState, useEffect } from 'react';
import { useCSV, DataRow } from '../../hooks/useCSV';
import { Button } from '../ui/button';
import { Plus, Trash2, Loader2 } from 'lucide-react';

interface CSVEditorProps {
  pagePath: string;
  initialHeaders?: string[];
  editable?: boolean;
  className?: string;
  onSaveStatusChange?: (status: 'saved' | 'saving' | 'dirty') => void;
}

export const CSVEditor: React.FC<CSVEditorProps> = ({
  pagePath,
  initialHeaders,
  editable = true,
  className = '',
  onSaveStatusChange,
}) => {
  const {
    rows,
    headers,
    updateCell,
    addRow,
    deleteRow,
    isLoaded,
    connectionStatus,
  } = useCSV<DataRow>(pagePath, initialHeaders);

  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleCellClick = useCallback((rowIndex: number, column: string, value: string) => {
    if (!editable) return;
    setEditingCell({ row: rowIndex, col: column });
    setEditValue(String(value ?? ''));
  }, [editable]);

  const handleCellBlur = useCallback(() => {
    if (editingCell) {
      updateCell(editingCell.row, editingCell.col, editValue);
      setEditingCell(null);
    }
  }, [editingCell, editValue, updateCell]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellBlur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    } else if (e.key === 'Tab' && editingCell) {
      e.preventDefault();
      handleCellBlur();
      // Move to next cell
      const currentColIndex = headers.indexOf(editingCell.col);
      if (currentColIndex < headers.length - 1) {
        const nextCol = headers[currentColIndex + 1];
        const currentValue = rows[editingCell.row]?.[nextCol];
        setEditingCell({ row: editingCell.row, col: nextCol });
        setEditValue(String(currentValue ?? ''));
      } else if (editingCell.row < rows.length - 1) {
        // Move to first column of next row
        const nextCol = headers[0];
        const currentValue = rows[editingCell.row + 1]?.[nextCol];
        setEditingCell({ row: editingCell.row + 1, col: nextCol });
        setEditValue(String(currentValue ?? ''));
      }
    }
  }, [editingCell, editValue, handleCellBlur, headers, rows]);

  const handleAddRow = useCallback(() => {
    const newRow: DataRow = {};
    headers.forEach(h => { newRow[h] = ''; });
    addRow(newRow);
  }, [addRow, headers]);

  const handleDeleteRow = useCallback((rowIndex: number) => {
    deleteRow(rowIndex);
  }, [deleteRow]);

  if (!isLoaded) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading data...</span>
      </div>
    );
  }

  if (headers.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <p className="text-muted-foreground mb-4">No data yet. Add some columns to get started.</p>
        {editable && (
          <Button onClick={handleAddRow} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add Row
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={`overflow-auto ${className}`}>
      {/* Connection status indicator */}
      {connectionStatus !== 'connected' && (
        <div className="mb-2 px-2 py-1 text-xs text-yellow-600 bg-yellow-50 rounded">
          {connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
        </div>
      )}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            {headers.map(header => (
              <th
                key={header}
                className="border border-border px-3 py-2 text-left font-medium text-foreground"
              >
                {header}
              </th>
            ))}
            {editable && <th className="border border-border px-2 py-2 w-10"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-accent/30">
              {headers.map(header => {
                const isEditing = editingCell?.row === rowIndex && editingCell?.col === header;
                const cellValue = row[header] ?? '';

                return (
                  <td
                    key={header}
                    className="border border-border px-0 py-0"
                    onClick={() => handleCellClick(rowIndex, header, String(cellValue))}
                  >
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleCellBlur}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        className="w-full h-full px-3 py-2 bg-background border-none outline-none focus:ring-2 focus:ring-primary"
                      />
                    ) : (
                      <div className="px-3 py-2 min-h-[2.5rem] cursor-text">
                        {String(cellValue)}
                      </div>
                    )}
                  </td>
                );
              })}
              {editable && (
                <td className="border border-border px-2 py-1 text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRow(rowIndex);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {editable && (
        <Button
          onClick={handleAddRow}
          variant="outline"
          size="sm"
          className="mt-3"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Row
        </Button>
      )}
    </div>
  );
};

export default CSVEditor;
