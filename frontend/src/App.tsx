import React from 'react';
import MainLayout from './components/layout/MainLayout';
import { AppProvider } from './contexts/AppContext';
import ErrorBoundary from './components/common/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <div className="App">
          <MainLayout />
        </div>
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;