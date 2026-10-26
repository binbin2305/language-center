import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthResultDto, LoginInput, MeDto } from '@lc/shared';
import { apiGet, apiPost, refreshSession, setOnAuthFailure, tokenStore } from '@/lib/api';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  user: MeDto | null;
  status: AuthStatus;
  login(input: LoginInput): Promise<void>;
  logout(): Promise<void>;
  refreshMe(): Promise<void>;
  /** Adopt the result of an auth endpoint that rotates the session (change-password). */
  applySession(result: AuthResultDto): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: React.ReactNode;
  /** Skips the boot refresh; used by tests and storybook-style previews. */
  initialUser?: MeDto | null;
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<MeDto | null>(initialUser ?? null);
  const [status, setStatus] = useState<AuthStatus>(
    initialUser ? 'authenticated' : initialUser === null ? 'anonymous' : 'loading',
  );
  const booting = useRef(status === 'loading');

  const goAnonymous = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Boot: exchange the refresh cookie for a session.
  useEffect(() => {
    if (initialUser !== undefined) return;
    let cancelled = false;
    refreshSession()
      .then((r) => {
        if (cancelled) return;
        setUser(r.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!cancelled) setStatus('anonymous');
      })
      .finally(() => {
        booting.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [initialUser]);

  // Refresh rejected mid-session: drop to anonymous and send the user to /login.
  useEffect(() => {
    setOnAuthFailure(() => {
      if (booting.current) return; // RequireAuth redirects with return-to after boot
      goAnonymous();
      navigate('/login', { replace: true });
    });
    return () => setOnAuthFailure(() => undefined);
  }, [goAnonymous, navigate]);

  const applySession = useCallback((r: AuthResultDto) => {
    tokenStore.set(r.accessToken);
    setUser(r.user);
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      const r = await apiPost<AuthResultDto>('auth/login', input);
      queryClient.clear();
      applySession(r);
    },
    [applySession, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await apiPost('auth/logout');
    } catch {
      /* the local session is dropped regardless */
    }
    goAnonymous();
    navigate('/login', { replace: true });
  }, [goAnonymous, navigate]);

  const refreshMe = useCallback(async () => {
    setUser(await apiGet<MeDto>('auth/me'));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, logout, refreshMe, applySession }),
    [user, status, login, logout, refreshMe, applySession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
