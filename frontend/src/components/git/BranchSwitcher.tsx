import React, { useState, useEffect } from 'react';
import { GitBranch, Plus, Check, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';

interface BranchSwitcherProps {
  onBranchChange?: (branch: string) => void;
}

interface BranchInfo {
  name: string;
  tags: string[];
}

const BranchSwitcher: React.FC<BranchSwitcherProps> = ({ onBranchChange }) => {
  const [branches, setBranches] = useState<string[]>([]);
  const [branchTags, setBranchTags] = useState<Map<string, string[]>>(new Map());
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  // Fetch branches and current branch on mount
  useEffect(() => {
    fetchBranches();
    fetchCurrentBranch();
  }, []);

  const fetchBranches = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/git/branches');
      const data = await response.json();
      const branchList = data.branches || [];
      setBranches(branchList);

      // Fetch tags for each branch
      const tagsMap = new Map<string, string[]>();
      await Promise.all(
        branchList.map(async (branch: string) => {
          try {
            const tagsResponse = await fetch(`http://localhost:8000/api/git/branches/${encodeURIComponent(branch)}/tags`);
            const tagsData = await tagsResponse.json();
            tagsMap.set(branch, tagsData.tags || []);
          } catch (err) {
            console.error(`Failed to fetch tags for branch ${branch}:`, err);
            tagsMap.set(branch, []);
          }
        })
      );
      setBranchTags(tagsMap);
    } catch (error) {
      console.error('Failed to fetch branches:', error);
    }
  };

  const fetchCurrentBranch = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/git/current-branch');
      const data = await response.json();
      setCurrentBranch(data.branch);
    } catch (error) {
      console.error('Failed to fetch current branch:', error);
    }
  };

  const handleCheckoutBranch = async (branchName: string) => {
    if (branchName === currentBranch) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/git/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: branchName }),
      });

      if (!response.ok) {
        throw new Error('Failed to checkout branch');
      }

      setCurrentBranch(branchName);
      setIsOpen(false);

      // Notify parent component
      if (onBranchChange) {
        onBranchChange(branchName);
      }

      // Reload the page to show content from new branch
      window.location.reload();
    } catch (error) {
      console.error('Failed to checkout branch:', error);
      alert('Failed to switch branch. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/git/create-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newBranchName.trim(),
          from: currentBranch
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create branch');
      }

      const data = await response.json();

      // Refresh branches list
      await fetchBranches();
      setCurrentBranch(data.branch);
      setNewBranchName('');
      setIsCreating(false);
      setIsOpen(false);

      // Notify parent component
      if (onBranchChange) {
        onBranchChange(data.branch);
      }

      // Reload to show new branch
      window.location.reload();
    } catch (error: any) {
      console.error('Failed to create branch:', error);
      alert(error.message || 'Failed to create branch. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBranch = async (branchName: string, event: React.MouseEvent) => {
    event.stopPropagation();

    if (branchName === currentBranch) {
      alert('Cannot delete the currently checked out branch. Switch to another branch first.');
      return;
    }

    if (branchName === 'main') {
      alert('Cannot delete the main branch.');
      return;
    }

    if (!confirm(`Are you sure you want to delete branch "${branchName}"?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:8000/api/git/branches/${encodeURIComponent(branchName)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete branch');
      }

      // Refresh branches list
      await fetchBranches();
    } catch (error: any) {
      console.error('Failed to delete branch:', error);
      alert(error.message || 'Failed to delete branch. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getBranchColor = (branch: string) => {
    if (branch === 'main') return 'text-green-600 dark:text-green-400';
    return 'text-blue-600 dark:text-blue-400';
  };

  const getTagColor = (tag: string) => {
    if (tag === 'review') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
    if (tag === 'approved') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    if (tag === 'rejected') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  };

  const handleToggleDropdown = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left
      });
    }
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      {/* Branch Button */}
      <Button
        ref={buttonRef}
        variant="outline"
        size="sm"
        onClick={handleToggleDropdown}
        disabled={isLoading}
        className="w-full justify-start gap-2"
      >
        <GitBranch className={`h-4 w-4 ${getBranchColor(currentBranch)}`} />
        <span className="flex-1 text-left truncate">{currentBranch}</span>
        <span className="text-xs text-muted-foreground">
          {branches.length} {branches.length === 1 ? 'branch' : 'branches'}
        </span>
      </Button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => {
              setIsOpen(false);
              setIsCreating(false);
            }}
          />

          {/* Menu */}
          <div
            className="fixed z-[9999] bg-background border rounded-md shadow-xl max-h-80 overflow-y-auto min-w-[400px]"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`
            }}
          >
            {/* Branch List */}
            <div className="py-1">
              {branches.map((branch) => {
                const tags = branchTags.get(branch) || [];
                return (
                  <div
                    key={branch}
                    className={`w-full hover:bg-accent ${
                      branch === currentBranch ? 'bg-accent' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        onClick={() => handleCheckoutBranch(branch)}
                        disabled={isLoading}
                        className="flex-1 flex items-center gap-2 text-left"
                      >
                        <GitBranch className={`h-4 w-4 flex-shrink-0 ${getBranchColor(branch)}`} />
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm truncate">{branch}</div>
                          {tags.length > 0 && (
                            <div className="flex gap-1 mt-1 flex-wrap">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${getTagColor(tag)}`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {branch === currentBranch && (
                          <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                        )}
                      </button>
                      {branch !== 'main' && branch !== currentBranch && (
                        <button
                          onClick={(e) => handleDeleteBranch(branch, e)}
                          disabled={isLoading}
                          className="p-1 hover:bg-destructive/10 rounded text-destructive disabled:opacity-50"
                          title="Delete branch"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Separator */}
            <div className="border-t my-1" />

            {/* Create New Branch */}
            {!isCreating ? (
              <button
                onClick={() => setIsCreating(true)}
                disabled={isLoading}
                className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Plus className="h-4 w-4" />
                <span>Create new branch</span>
              </button>
            ) : (
              <div className="p-3 space-y-2">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="Branch name"
                  className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateBranch();
                    } else if (e.key === 'Escape') {
                      setIsCreating(false);
                      setNewBranchName('');
                    }
                  }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleCreateBranch}
                    disabled={!newBranchName.trim() || isLoading}
                    className="flex-1"
                  >
                    Create
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsCreating(false);
                      setNewBranchName('');
                    }}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Branch from: <span className={getBranchColor(currentBranch)}>{currentBranch}</span>
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default BranchSwitcher;
