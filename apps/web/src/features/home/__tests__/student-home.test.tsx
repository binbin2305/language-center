import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const T = { timeout: 10_000 };
const enrollment = (confirmedAt: string | null) => ({
  id: '64b000000000000000000001',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  studentId: '64b000000000000000000002',
  courseId: '64b000000000000000000003',
  classId: '64b000000000000000000004',
  className: 'Lớp A2 tối',
  status: 'ENROLLED',
  placementLevel: 'A2',
  placementSkipped: null,
  levelOverride: null,
  waitingSince: '2026-01-01T00:00:00.000Z',
  enrolledAt: '2026-01-02T00:00:00.000Z',
  confirmedAt,
  transferredToId: null,
  transferredFromId: null,
  invoiceId: null,
  history: [],
});

describe('D19 trang chủ học viên', () => {
  it('FR-CLS-11: ENROLLED chưa xác nhận → trang chủ HV hiện banner "Xác nhận lớp"', async () => {
    server.use(http.get('*/api/v1/enrollments/me', () => HttpResponse.json({ data: [enrollment(null)] })));
    renderApp({ route: '/', user: makeUser('STUDENT') });
    expect(await screen.findByRole('heading', { name: 'Trang của tôi' }, T)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Xác nhận lớp' }, T)).toBeInTheDocument();
    expect(screen.getByText('Lớp A2 tối')).toBeInTheDocument();
  });

  it('FR-CLS-11: đã xác nhận → không có banner', async () => {
    server.use(
      http.get('*/api/v1/enrollments/me', () => HttpResponse.json({ data: [enrollment('2026-01-02T00:00:00.000Z')] })),
    );
    renderApp({ route: '/', user: makeUser('STUDENT') });
    expect(await screen.findByRole('heading', { name: 'Trang của tôi' }, T)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận lớp' })).not.toBeInTheDocument();
  });
});
