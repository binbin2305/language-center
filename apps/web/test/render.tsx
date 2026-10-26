import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { MeDto } from '@lc/shared';
import { AuthProvider } from '@/auth/auth-context';
import { AppRoutes } from '@/router';

export interface RenderOptions {
  /** Preset signed-in user (skips the boot refresh). `null` = anonymous. */
  user?: MeDto | null;
  route?: string;
}

const testQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

/** Renders a single component inside providers (auth preset via `user`; anonymous by default). */
export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  const queryClient = testQueryClient();
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[options.route ?? '/']}>
          <AuthProvider initialUser={options.user ?? null}>{ui}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

/**
 * Renders the whole app (real route table). With `user`, the session is preset; without it,
 * the boot `POST /auth/refresh` goes to MSW (tests must mock it).
 */
export function renderApp(options: RenderOptions = {}) {
  const queryClient = testQueryClient();
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[options.route ?? '/']}>
          <AppRoutes auth={options.user === undefined ? undefined : { initialUser: options.user }} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}
