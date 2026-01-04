import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import { Github, Key, LogOut, User } from 'lucide-react';

/**
 * Login buttons for OAuth providers
 *
 * Shows available OAuth providers based on backend configuration.
 * Hidden when user is already authenticated with OAuth.
 */
export const LoginButtons: React.FC<{ className?: string }> = ({ className }) => {
  const { providers, loginWithProvider, user, isLoading } = useAuth();

  if (isLoading || !providers) {
    return null;
  }

  // User is already authenticated with OAuth - no need to show login
  if (user?.type === 'oauth') {
    return null;
  }

  // No OAuth providers available
  if (providers.providers.length === 0) {
    return null;
  }

  return (
    <div className={`flex gap-2 ${className || ''}`}>
      {providers.providers.map((provider) => (
        <Button
          key={provider.id}
          variant="outline"
          size="sm"
          onClick={() => loginWithProvider(provider.id)}
          className="gap-2"
        >
          {provider.icon === 'github' && <Github className="h-4 w-4" />}
          {provider.icon === 'key' && <Key className="h-4 w-4" />}
          {provider.name}
        </Button>
      ))}
    </div>
  );
};

/**
 * User menu showing current user and auth options
 *
 * - For guests: shows login buttons + upgrade prompt
 * - For OAuth users: shows user info + logout
 */
export const UserMenu: React.FC<{ className?: string }> = ({ className }) => {
  const { user, logout, providers, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className || ''}`}>
        Loading...
      </div>
    );
  }

  if (!user) {
    // Not authenticated - show login options
    return <LoginButtons className={className} />;
  }

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      {/* User info */}
      <div className="flex items-center gap-2 text-sm">
        <User className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">
          {user.name || user.email || user.id}
        </span>
        {user.type === 'guest' && (
          <span className="text-xs text-muted-foreground/60">(Guest)</span>
        )}
      </div>

      {/* Show login buttons for guests to upgrade */}
      {user.type === 'guest' && providers && providers.providers.length > 0 && (
        <LoginButtons />
      )}

      {/* Logout button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={logout}
        className="gap-1 text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </div>
  );
};

/**
 * Compact login button for toolbars
 */
export const CompactLoginButton: React.FC<{ className?: string }> = ({ className }) => {
  const { providers, loginWithProvider, user, isLoading } = useAuth();

  if (isLoading || !providers || user?.type === 'oauth') {
    return null;
  }

  // Show first available provider
  const firstProvider = providers.providers[0];
  if (!firstProvider) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => loginWithProvider(firstProvider.id)}
      className={`gap-1 ${className || ''}`}
      title={`Sign in with ${firstProvider.name}`}
    >
      {firstProvider.icon === 'github' && <Github className="h-4 w-4" />}
      {firstProvider.icon === 'key' && <Key className="h-4 w-4" />}
      <span className="hidden sm:inline">Sign in</span>
    </Button>
  );
};
