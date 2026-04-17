import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import i18n from '../i18n';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'builder' | 'user';
  language: string;
}

interface AuthContextValue {
  user: AuthUser;
  token: string;
  logout: () => void;
  updateUser: (patch: Partial<Pick<AuthUser, 'name' | 'language'>>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

interface AuthState {
  status: 'loading' | 'unauthenticated' | 'authenticated';
  user: AuthUser | null;
  token: string | null;
  hasUsers: boolean;
}

interface Props {
  children: (user: AuthUser, token: string) => ReactNode;
  fallback: (hasUsers: boolean, onAuth: (user: AuthUser, token: string) => void) => ReactNode;
}

export function AuthProvider({ children, fallback }: Props) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    token: null,
    hasUsers: false,
  });

  useEffect(() => {
    const init = async () => {
      // Check if any users exist
      const statusRes = await fetch('/api/auth/status').catch(() => null);
      const status = statusRes ? await statusRes.json() as { has_users: boolean } : { has_users: false };

      const token = localStorage.getItem('zenku-token');
      if (!token) {
        setState({ status: 'unauthenticated', user: null, token: null, hasUsers: status.has_users });
        return;
      }

      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      if (!meRes?.ok) {
        localStorage.removeItem('zenku-token');
        setState({ status: 'unauthenticated', user: null, token: null, hasUsers: status.has_users });
        return;
      }

      const user = await meRes.json() as AuthUser;
      if (user.language) {
        i18n.changeLanguage(user.language);
      }
      setState({ status: 'authenticated', user, token, hasUsers: true });
    };

    void init();
  }, []);

  const handleAuth = (user: AuthUser, token: string) => {
    localStorage.setItem('zenku-token', token);
    if (user.language) {
      i18n.changeLanguage(user.language);
    }
    setState({ status: 'authenticated', user, token, hasUsers: true });
  };

  const logout = () => {
    const token = localStorage.getItem('zenku-token');
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('zenku-token');
    setState(prev => ({ ...prev, status: 'unauthenticated', user: null, token: null }));
  };

  const updateUser = (patch: Partial<Pick<AuthUser, 'name' | 'language'>>) => {
    setState(prev => prev.user ? { ...prev, user: { ...prev.user, ...patch } } : prev);
  };

  if (state.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (state.status === 'unauthenticated' || !state.user || !state.token) {
    return <>{fallback(state.hasUsers, handleAuth)}</>;
  }

  return (
    <AuthContext.Provider value={{ user: state.user, token: state.token, logout, updateUser }}>
      {children(state.user, state.token)}
    </AuthContext.Provider>
  );
}
