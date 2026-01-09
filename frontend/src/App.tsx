import MainLayout from './components/layout/MainLayout';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import { SelectionProvider } from './contexts/SelectionContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import { useUrlState } from './hooks/useUrlState';
import { Toaster } from '@/components/ui/sonner';

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
          <SelectionProvider>
            <UrlStateInitializer />
            <div className="App">
              <BrokenComponent />
              <Toaster position="bottom-center" />
            </div>
          </SelectionProvider>
        </AppProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;