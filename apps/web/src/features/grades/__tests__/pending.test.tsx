import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { server } from '../../../../test/msw/server';
import { usePendingAssessments } from '../hooks';

describe('usePendingAssessments (FR-GRD-02)', () => {
  it('gọi GET /assessments/pending và trả danh sách bài chưa xác nhận', async () => {
    let called = 0;
    server.use(
      http.get('*/api/v1/assessments/pending', () => {
        called += 1;
        return HttpResponse.json({ data: [{ id: 'a1', classCode: 'L1', className: 'IELTS A1', name: 'Giữa kỳ' }] });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => usePendingAssessments(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(called).toBe(1);
    expect(result.current.data?.[0]).toMatchObject({ classCode: 'L1', name: 'Giữa kỳ' });
  });
});
