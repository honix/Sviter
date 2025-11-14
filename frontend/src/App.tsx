import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import { AgentDashboard } from './components/agents/AgentDashboard';
import { PRReview } from './components/agents/PRReview';
import { AppProvider } from './contexts/AppContext';
import ErrorBoundary from './components/common/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <div className="App">
            <Routes>
              {/* Main wiki interface */}
              <Route path="/" element={<MainLayout />} />

              {/* Agent dashboard */}
              <Route path="/agents" element={<AgentDashboard />} />

              {/* PR review page */}
              <Route path="/agents/pr/:branch" element={<PRReview />} />
            </Routes>
          </div>
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;