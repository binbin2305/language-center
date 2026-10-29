import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../../../test/msw/server';
import { useCreateUser, useLockUser } from '../hooks';

const user = (role: string) => ({
  id: '65000000000000000000b001', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  username: 'gv@lc.vn', email: 'gv@lc.vn', fullName: 'Cô Lan', role, status: 'ACTIVE', mustChangePassword: true,
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  qc.setQueryData(['teachers'], []);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const teachersStale = () => qc.getQueryState(['teachers'])?.isInvalidated;
  return { wrapper, teachersStale };
}

describe('cache GV sau khi đổi tài khoản', () => {
  it.each([
    ['TEACHER', true],
    ['ACADEMIC_STAFF', false],
  ])('tạo tài khoản %s → làm mới ["teachers"]: %s', async (role, stale) => {
    server.use(http.post('*/api/v1/users', () => HttpResponse.json({ data: { user: user(role), tempPassword: 'x' } }, { status: 201 })));
    const { wrapper, teachersStale } = setup();
    const { result } = renderHook(() => useCreateUser(), { wrapper });
    await act(() => result.current.mutateAsync({ email: 'gv@lc.vn', fullName: 'Cô Lan', role } as never));
    expect(teachersStale()).toBe(stale);
  });

  it('khóa tài khoản TEACHER → làm mới ["teachers"]', async () => {
    server.use(http.post('*/api/v1/users/:id/lock', () => HttpResponse.json({ data: { ...user('TEACHER'), status: 'LOCKED' } })));
    const { wrapper, teachersStale } = setup();
    const { result } = renderHook(() => useLockUser(), { wrapper });
    await act(() => result.current.mutateAsync('65000000000000000000b001'));
    expect(teachersStale()).toBe(true);
  });
});
