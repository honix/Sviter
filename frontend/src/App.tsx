import MainLayout from './components/layout/MainLayout';
import { AppProvider } from './contexts/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import { SelectionProvider } from './contexts/SelectionContext';
import { ThemeProvider } from './contexts/ThemeContext';
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
      <ThemeProvider>
        <AuthProvider>
          <AppProvider>
            <SelectionProvider>
              <UrlStateInitializer />
              <div className="App">
                <MainLayout />
                <Toaster position="bottom-center" />
              </div>
            </SelectionProvider>
          </AppProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;