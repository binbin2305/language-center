import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const T = { timeout: 10_000 };

function track() {
  const froms: string[] = [];
  server.use(
    http.get('*/api/v1/sessions', ({ request }) => {
      froms.push(new URL(request.url).searchParams.get('from') ?? '');
      return HttpResponse.json({ data: [] });
    }),
    http.get('*/api/v1/assessments/pending', () => HttpResponse.json({ data: [] })),
    http.get('*/api/v1/placement-tests', () => HttpResponse.json({ data: [], meta: { page: 1, limit: 5, total: 0 } })),
    http.get('*/api/v1/enrollments/me', () => HttpResponse.json({ data: [] })),
  );
  return froms;
}

describe('trang chủ qua nửa đêm VN', () => {
  afterEach(() => vi.useRealTimers());

  it('trang chủ GV mở lúc 23:59 VN, qua nửa đêm → gọi lại /sessions?from=<ngày mới>', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-02T16:59:30Z'));
    const froms = track();
    renderApp({ route: '/', user: makeUser('TEACHER') });
    expect(await screen.findByText('Hôm nay không có buổi dạy', {}, T)).toBeInTheDocument();
    expect(froms).toContain('2026-11-02');
    await vi.advanceTimersByTimeAsync(31_000);
    await vi.waitFor(() => expect(froms).toContain('2026-11-03'), T);
  });

  it('trang chủ HV tương tự cho "buổi học tiếp theo"', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-02T16:59:30Z'));
    const froms = track();
    renderApp({ route: '/', user: makeUser('STUDENT') });
    expect(await screen.findByText('Chưa có buổi học sắp tới', {}, T)).toBeInTheDocument();
    expect(froms).toContain('2026-11-02');
    await vi.advanceTimersByTimeAsync(31_000);
    await vi.waitFor(() => expect(froms).toContain('2026-11-03'), T);
  });
});
