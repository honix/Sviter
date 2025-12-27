import MainLayout from './components/layout/MainLayout';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import { useUrlState } from './hooks/useUrlState';

/**
 * Component that initializes URL state syncing.
 * Must be inside AppProvider to access context.
 */
function UrlStateInitializer() {
  useUrlState();
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppProvider>
          <UrlStateInitializer />
          <div className="App">
            <MainLayout />
          </div>
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;