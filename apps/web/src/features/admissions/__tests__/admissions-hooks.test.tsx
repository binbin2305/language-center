import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../../../test/msw/server';
import { useConvertLead } from '../hooks';

const LEAD_ID = '65000000000000000000f001';

describe('FR-ADM-03 cache sau khi tạo hồ sơ học viên', () => {
  it('convert lead → làm mới cả ["leads"] và ["students"]', async () => {
    server.use(
      http.post(`*/api/v1/leads/${LEAD_ID}/convert`, () =>
        HttpResponse.json({ data: { student: { id: '65000000000000000000a001' }, tempPassword: 'x' } }, { status: 201 }),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    qc.setQueryData(['students', 'list', {}], { data: [] });
    qc.setQueryData(['leads', 'list', {}], { data: [] });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useConvertLead(LEAD_ID), { wrapper });
    await act(() => result.current.mutateAsync(false));
    expect(qc.getQueryState(['leads', 'list', {}])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(['students', 'list', {}])?.isInvalidated).toBe(true);
  });
});
