import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const T = { timeout: 10_000 };
const iso = (offsetH: number) => new Date(Date.now() + offsetH * 3600_000).toISOString();
const base = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const session = (id: string, code: string, startH: number, over: Record<string, unknown> = {}) => ({
  id, ...base, classId: '65000000000000000000d001', classCode: code,
  startAt: iso(startH), endAt: iso(startH + 1), roomId: '65000000000000000000e001', roomName: 'P101',
  teacherId: '65000000000000000000e002', status: 'SCHEDULED', cancelReason: null, seriesId: null,
  attendanceTakenAt: null, ...over,
});
const sumRow = (over: Record<string, unknown> = {}) => ({
  key: '65000000000000000000a001', label: 'HV', PRESENT: 3, LATE: 0, EXCUSED: 1, UNEXCUSED: 0, total: 4,
  attendanceRate: 0.75, absenceRate: 0.25, ...over,
});
const result = (average: number | null) => ({
  studentId: '65000000000000000000a001', classId: '65000000000000000000d001', courseId: '65000000000000000000d002',
  items: [], average, gradeClass: null, passed: null,
});
const invoice = (balance: number, dueDate: string) => ({
  id: `65000000000000000000f${dueDate.slice(-2)}1`, ...base, code: 'HD1', kind: 'TUITION',
  studentId: '65000000000000000000a001', enrollmentId: null, courseId: null, classId: null, description: null,
  amountDue: 3000000, discount: null, finalAmount: 3000000, amountPaid: 3000000 - balance, balance, dueDate,
  status: balance ? 'PARTIAL' : 'PAID',
});
const page = (data: unknown[]) => HttpResponse.json({ data, meta: { page: 1, limit: 50, total: data.length } });
const stub = (o: { sessions?: unknown[]; summary?: unknown[]; results?: unknown[] | 'fees'; invoices?: unknown[] } = {}) =>
  server.use(
    http.get('*/api/v1/enrollments/me', () => HttpResponse.json({ data: [] })),
    http.get('*/api/v1/sessions', () => HttpResponse.json({ data: o.sessions ?? [] })),
    http.get('*/api/v1/attendance/summary', () => HttpResponse.json({ data: o.summary ?? [] })),
    http.get('*/api/v1/results', () =>
      o.results === 'fees'
        ? HttpResponse.json({ error: { code: 'FEES_OUTSTANDING', message: 'x' } }, { status: 403 })
        : page(o.results ?? []),
    ),
    http.get('*/api/v1/invoices', () => page(o.invoices ?? [])),
  );

describe('trang chủ học viên', () => {
  it('FR-SCH-06: "Buổi học tiếp theo" là buổi gần nhất trong tương lai', async () => {
    stub({ sessions: [session('65000000000000000000c001', 'CU-QUA-KHU', -5), session('65000000000000000000c003', 'XA', 30), session('65000000000000000000c002', 'GAN-NHAT', 3)] });
    renderApp({ route: '/', user: makeUser('STUDENT') });
    const block = await screen.findByRole('region', { name: 'Buổi học tiếp theo' }, T);
    expect(await within(block).findByText(/GAN-NHAT/, {}, T)).toBeInTheDocument();
    expect(within(block).queryByText(/XA/)).not.toBeInTheDocument();
    expect(within(block).queryByText(/CU-QUA-KHU/)).not.toBeInTheDocument();
  });

  it('FR-ATT-05: hiện tỷ lệ chuyên cần "75%"', async () => {
    stub({ summary: [sumRow()] });
    renderApp({ route: '/', user: makeUser('STUDENT') });
    const block = await screen.findByRole('region', { name: 'Chuyên cần' }, T);
    expect(await within(block).findByText('75%', {}, T)).toBeInTheDocument();
  });

  it('FR-GRD-06: điểm TB hiện tại = trung bình các average khác null; không có → "Chưa có điểm"', async () => {
    stub({ results: [result(8), result(6), result(null)] });
    const view = renderApp({ route: '/', user: makeUser('STUDENT') });
    const block = await screen.findByRole('region', { name: 'Điểm trung bình' }, T);
    expect(await within(block).findByText('7', {}, T)).toBeInTheDocument();
    view.unmount();
    stub({ results: [result(null)] });
    renderApp({ route: '/', user: makeUser('STUDENT') });
    expect(await screen.findByText('Chưa có điểm', {}, T)).toBeInTheDocument();
  });

  it('FR-FEE-06: còn nợ = Σ balance + hạn gần nhất của hóa đơn còn nợ', async () => {
    stub({ invoices: [invoice(1000000, '2026-03-10'), invoice(500000, '2026-02-05'), invoice(0, '2026-01-01')] });
    renderApp({ route: '/', user: makeUser('STUDENT') });
    const block = await screen.findByRole('region', { name: 'Học phí' }, T);
    expect(await within(block).findByText(/1\.500\.000/, {}, T)).toBeInTheDocument();
    expect(within(block).getByText(/05\/02\/2026/)).toBeInTheDocument();
  });

  it('FR-FEE-06: không nợ → "Không còn nợ"', async () => {
    stub({ invoices: [invoice(0, '2026-01-01')] });
    renderApp({ route: '/', user: makeUser('STUDENT') });
    expect(await screen.findByText('Không còn nợ', {}, T)).toBeInTheDocument();
  });

  it('FR-CLS-11: banner xác nhận vẫn hiển thị và biến mất sau POST /enrollments/:id/confirm', async () => {
    let confirmed = false;
    const enr = () => ({
      id: '64b000000000000000000001', ...base, studentId: '64b000000000000000000002', courseId: '64b000000000000000000003',
      classId: '64b000000000000000000004', className: 'Lớp A2 tối', status: 'ENROLLED', placementLevel: 'A2',
      placementSkipped: null, levelOverride: null, waitingSince: '2026-01-01T00:00:00.000Z',
      enrolledAt: '2026-01-02T00:00:00.000Z', confirmedAt: confirmed ? '2026-01-03T00:00:00.000Z' : null,
      transferredToId: null, transferredFromId: null, invoiceId: null, history: [],
    });
    stub();
    server.use(
      http.get('*/api/v1/enrollments/me', () => HttpResponse.json({ data: [enr()] })),
      http.post('*/api/v1/enrollments/:id/confirm', () => { confirmed = true; return HttpResponse.json({ data: enr() }); }),
    );
    renderApp({ route: '/', user: makeUser('STUDENT') });
    await userEvent.click(await screen.findByRole('button', { name: 'Xác nhận lớp' }, T));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Xác nhận lớp' })).not.toBeInTheDocument());
  });

  it('FR-CLS-10: /results trả 403 FEES_OUTSTANDING → khối điểm cảnh báo, các khối khác vẫn hiển thị', async () => {
    stub({ results: 'fees', summary: [sumRow()], invoices: [invoice(0, '2026-01-01')] });
    renderApp({ route: '/', user: makeUser('STUDENT') });
    const grades = await screen.findByRole('region', { name: 'Điểm trung bình' }, T);
    expect(await within(grades).findByRole('alert', {}, T)).toHaveTextContent(/học phí/i);
    expect(await screen.findByText('75%', {}, T)).toBeInTheDocument();
    expect(await screen.findByText('Không còn nợ', {}, T)).toBeInTheDocument();
  });
});
