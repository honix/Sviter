/**
 * BranchContext provides branch information to data-fetching hooks.
 * When viewing a thread branch in ephemeral mode, hooks use this context
 * to fetch data from the branch and allow local-only mutations.
 */

import React, { createContext, useContext } from 'react';

interface BranchContextValue {
  /** Branch ref to fetch data from, or undefined for main/working tree */
  viewingBranch: string | undefined;
  /** If true, mutations work locally but are not saved to git */
  ephemeral: boolean;
}

const defaultValue: BranchContextValue = {
  viewingBranch: undefined,
  ephemeral: false,
};

const BranchContext = createContext<BranchContextValue>(defaultValue);

interface BranchProviderProps {
  /** Branch ref (e.g., "thread/feature/123") or undefined for main */
  branch: string | undefined;
  /** Enable ephemeral mode - mutations work locally but don't save */
  ephemeral?: boolean;
  children: React.ReactNode;
}

/**
 * Provides branch context to child components.
 * Used in thread review View mode to enable ephemeral editing.
 */
export const BranchProvider: React.FC<BranchProviderProps> = ({
  branch,
  ephemeral = false,
  children,
}) => {
  const value: BranchContextValue = {
    viewingBranch: branch,
    ephemeral,
  };

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
};

/**
 * Hook to access branch context.
 * Returns { viewingBranch, ephemeral } for use in data hooks.
 */
export const useBranch = (): BranchContextValue => {
  return useContext(BranchContext);
};

export default BranchContext;
