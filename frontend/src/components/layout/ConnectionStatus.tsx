import React from 'react';
import { useAppContext } from '../../contexts/AppContext';

const ConnectionStatus: React.FC = () => {
  const { state } = useAppContext();
  const { isConnected } = state;

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`flex items-center px-3 py-2 rounded-lg shadow-md ${
        isConnected
          ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200'
          : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200'
      }`}>
        <div className={`w-2 h-2 rounded-full mr-2 ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}></div>
        <span className="text-sm font-medium">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </div>
  );
};

export default ConnectionStatus;