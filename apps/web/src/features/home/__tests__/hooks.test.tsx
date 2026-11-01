import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../../../test/msw/server';
import { useUpcomingPlacementTests } from '../hooks';

describe('useUpcomingPlacementTests (FR-PLC, trang chủ GV)', () => {
  it('khóa cache theo ngày VN: 00:30 VN 02/11 (17:30Z 01/11) thuộc ngày 2026-11-02', async () => {
    server.use(http.get('*/api/v1/placement-tests', () => HttpResponse.json({ data: [], meta: { page: 1, limit: 5, total: 0 } })));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useUpcomingPlacementTests('2026-11-01T17:30:00.000Z'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryCache().getAll().map((q) => q.queryKey)).toEqual([['home', 'placement', '2026-11-02']]);
  });
});
