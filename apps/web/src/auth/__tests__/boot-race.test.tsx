import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/msw/server';
import { makeUser } from '../../../test/users';
import { tokenStore } from '@/lib/api';
import { AuthProvider } from '../auth-context';
import { useAuth } from '../use-auth';

function Probe() {
  const { user, status, login } = useAuth();
  return (
    <div>
      <span data-testid="state">{`${status}:${user?.fullName ?? '-'}`}</span>
      <button onClick={() => void login({ username: 'a', password: 'b' })}>go</button>
    </div>
  );
}

function setup(bootOutcome: 'ok' | 'fail') {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  server.use(
    http.post('*/api/v1/auth/refresh', async () => {
      await gate;
      return bootOutcome === 'ok'
        ? HttpResponse.json({ data: { accessToken: 'boot', user: makeUser('MANAGER', { fullName: 'Late Boot' }) } })
        : HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, { status: 401 });
    }),
    http.post('*/api/v1/auth/login', () =>
      HttpResponse.json({ data: { accessToken: 'login', user: makeUser('TEACHER', { fullName: 'Logged In' }) } }),
    ),
  );
  tokenStore.clear();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return release;
}

describe.each(['ok', 'fail'] as const)('login trong lúc boot refresh đang chờ (%s)', (outcome) => {
  it('kết quả boot đến muộn không ghi đè phiên đăng nhập', async () => {
    const release = setup(outcome);
    await userEvent.setup().click(screen.getByText('go'));
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('authenticated:Logged In'));
    release();
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByTestId('state')).toHaveTextContent('authenticated:Logged In');
    expect(tokenStore.get()).toBe('login');
  });
});
