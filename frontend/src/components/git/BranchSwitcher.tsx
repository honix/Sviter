import React, { useState, useEffect } from 'react';
import { GitBranch, Plus, Check } from 'lucide-react';
import { Button } from '../ui/button';

interface BranchSwitcherProps {
  onBranchChange?: (branch: string) => void;
}

const BranchSwitcher: React.FC<BranchSwitcherProps> = ({ onBranchChange }) => {
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch branches and current branch on mount
  useEffect(() => {
    fetchBranches();
    fetchCurrentBranch();
  }, []);

  const fetchBranches = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/git/branches');
      const data = await response.json();
      setBranches(data.branches || []);
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

  const getBranchColor = (branch: string) => {
    if (branch === 'main') return 'text-green-600 dark:text-green-400';
    return 'text-blue-600 dark:text-blue-400';
  };

  return (
    <div className="relative">
      {/* Branch Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
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
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false);
              setIsCreating(false);
            }}
          />

          {/* Menu */}
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-background border rounded-md shadow-lg max-h-80 overflow-y-auto">
            {/* Branch List */}
            <div className="py-1">
              {branches.map((branch) => (
                <button
                  key={branch}
                  onClick={() => handleCheckoutBranch(branch)}
                  disabled={isLoading}
                  className={`w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 ${
                    branch === currentBranch ? 'bg-accent' : ''
                  }`}
                >
                  <GitBranch className={`h-4 w-4 ${getBranchColor(branch)}`} />
                  <span className="flex-1 truncate">{branch}</span>
                  {branch === currentBranch && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
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
