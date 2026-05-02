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
  authMode: 'local' | 'sso_only';
  logout: () => void;
  updateUser: (patch: Partial<Pick<AuthUser, 'name' | 'language'>>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export interface OidcProvider {
  id: string;
  name: string;
}

interface AuthState {
  status: 'loading' | 'unauthenticated' | 'authenticated';
  user: AuthUser | null;
  token: string | null;
  hasUsers: boolean;
  oidcProviders: OidcProvider[];
  authMode: 'local' | 'sso_only';
}

interface Props {
  children: (user: AuthUser, token: string) => ReactNode;
  fallback: (hasUsers: boolean, oidcProviders: OidcProvider[], authMode: 'local' | 'sso_only', onAuth: (user: AuthUser, token: string) => void) => ReactNode;
}

export function AuthProvider({ children, fallback }: Props) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    token: null,
    hasUsers: false,
    oidcProviders: [],
    authMode: 'local',
  });

  useEffect(() => {
    const init = async () => {
      const statusRes = await fetch('/api/auth/status').catch(() => null);
      const status = statusRes
        ? await statusRes.json() as { has_users: boolean; oidc_providers?: OidcProvider[]; auth_mode?: string }
        : { has_users: false, oidc_providers: [], auth_mode: 'local' };
      const oidcProviders = status.oidc_providers ?? [];
      const authMode: 'local' | 'sso_only' = status.auth_mode === 'sso_only' ? 'sso_only' : 'local';

      // Handle OIDC callback token in URL
      const urlParams = new URLSearchParams(window.location.search);
      const oidcToken = urlParams.get('oidc_token');
      if (oidcToken) {
        window.history.replaceState({}, '', window.location.pathname);
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${oidcToken}` },
        }).catch(() => null);
        if (meRes?.ok) {
          const user = await meRes.json() as AuthUser;
          localStorage.setItem('zenku-token', oidcToken);
          if (user.language) i18n.changeLanguage(user.language);
          setState({ status: 'authenticated', user, token: oidcToken, hasUsers: true, oidcProviders, authMode });
          return;
        }
      }

      const token = localStorage.getItem('zenku-token');
      if (!token) {
        setState({ status: 'unauthenticated', user: null, token: null, hasUsers: status.has_users, oidcProviders, authMode });
        return;
      }

      const meRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);

      if (!meRes?.ok) {
        localStorage.removeItem('zenku-token');
        setState({ status: 'unauthenticated', user: null, token: null, hasUsers: status.has_users, oidcProviders, authMode });
        return;
      }

      const user = await meRes.json() as AuthUser;
      if (user.language) {
        i18n.changeLanguage(user.language);
      }
      setState({ status: 'authenticated', user, token, hasUsers: true, oidcProviders, authMode });
    };

    void init();
  }, []);

  // Refresh OIDC session every 20 minutes when authenticated
  useEffect(() => {
    if (state.status !== 'authenticated' || !state.token || state.oidcProviders.length === 0) return;
    const token = state.token;
    const providers = state.oidcProviders;
    const doRefresh = () => {
      providers.forEach(p => {
        fetch('/api/auth/oidc/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ provider_id: p.id }),
        }).catch(() => {});
      });
    };
    const id = setInterval(doRefresh, 20 * 60 * 1000);
    return () => clearInterval(id);
  }, [state.status, state.token, state.oidcProviders]);

  const handleAuth = (user: AuthUser, token: string) => {
    localStorage.setItem('zenku-token', token);
    // If the user explicitly chose a language on the login page, honour it and
    // persist it to their profile so it sticks on the next login too.
    const loginLang = i18n.language;
    if (loginLang && loginLang !== user.language) {
      fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: user.name, language: loginLang }),
      }).catch(() => {});
      user = { ...user, language: loginLang };
    } else if (user.language) {
      i18n.changeLanguage(user.language);
    }
    setState(prev => ({ ...prev, status: 'authenticated', user, token, hasUsers: true }));
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
    return <>{fallback(state.hasUsers, state.oidcProviders, state.authMode, handleAuth)}</>;
  }

  return (
    <AuthContext.Provider value={{ user: state.user, token: state.token, authMode: state.authMode, logout, updateUser }}>
      {children(state.user, state.token)}
    </AuthContext.Provider>
  );
}
