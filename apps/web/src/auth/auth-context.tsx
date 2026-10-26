import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthResultDto, LoginInput, MeDto } from '@lc/shared';
import { ApiError, apiGet, apiPost, refreshSession, setOnAuthFailure, tokenStore } from '@/lib/api';

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
  // Bumped whenever the session changes by any other path, so a late boot result is stale.
  const epoch = useRef(0);
  const sessionToken = useRef<string | null>(null);
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

  const goAnonymous = useCallback(() => {
    epoch.current += 1;
    sessionToken.current = null;
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Boot: exchange the refresh cookie for a session.
  useEffect(() => {
    if (initialUser !== undefined) return;
    let cancelled = false;
    const startEpoch = epoch.current;
    // A stale boot (login/logout happened meanwhile) must not touch state; it may however
    // have overwritten or cleared the token, so restore the one the live session owns.
    const stale = () => {
      if (epoch.current === startEpoch) return false;
      const t = sessionToken.current;
      if (t && tokenStore.get() !== t) tokenStore.set(t);
      else if (!t && tokenStore.get()) tokenStore.clear();
      return true;
    };
    refreshSession()
      .then((r) => {
        if (cancelled || stale()) return;
        setUser(r.user);
        setStatus('authenticated');
      })
      .catch((e: unknown) => {
        if (cancelled || stale()) return;
        if (e instanceof ApiError && e.status === 0)
          toast.error('Không kết nối được máy chủ');
        setStatus('anonymous');
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
      const { pathname, search } = locationRef.current;
      const from = `${pathname}${search}`;
      navigate('/login', { replace: true, state: from === '/login' ? undefined : { from } });
    });
    return () => setOnAuthFailure(() => undefined);
  }, [goAnonymous, navigate]);

  const applySession = useCallback((r: AuthResultDto) => {
    epoch.current += 1;
    sessionToken.current = r.accessToken;
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
