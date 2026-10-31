import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const T = { timeout: 10_000 };
const iso = (offsetH: number) => new Date(Date.now() + offsetH * 3600_000).toISOString();

const session = (over: Record<string, unknown> = {}) => ({
  id: '65000000000000000000c001',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  classId: '65000000000000000000d001',
  classCode: 'A2-TOI',
  startAt: iso(1),
  endAt: iso(2),
  roomId: '65000000000000000000e001',
  roomName: 'P101',
  teacherId: '65000000000000000000e002',
  status: 'SCHEDULED',
  cancelReason: null,
  seriesId: null,
  attendanceTakenAt: null,
  ...over,
});
const pending = (over: Record<string, unknown> = {}) => ({
  id: '65000000000000000000a101',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  classId: '65000000000000000000d001',
  classCode: 'A2-TOI',
  className: 'Lớp A2 tối',
  name: 'Kiểm tra giữa kỳ',
  type: 'MIDTERM',
  weight: 30,
  heldOn: '2026-01-03',
  confirmedAt: null,
  unlockedUntil: null,
  lockedAt: '2026-02-01T00:00:00.000Z',
  isLocked: false,
  ...over,
});
const placement = (over: Record<string, unknown> = {}) => ({
  id: '65000000000000000000b201',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  courseId: '65000000000000000000b202',
  courseName: 'Tiếng Anh A2',
  startAt: iso(48),
  endAt: iso(50),
  roomId: '65000000000000000000e001',
  roomCode: 'P101',
  teacherId: '65000000000000000000e002',
  status: 'SCHEDULED',
  candidates: [],
  ...over,
});
const page = (data: unknown[]) => HttpResponse.json({ data, meta: { page: 1, limit: 5, total: data.length } });
const stub = (s: unknown[], p: unknown[], t: unknown[]) =>
  server.use(
    http.get('*/api/v1/sessions', () => HttpResponse.json({ data: s })),
    http.get('*/api/v1/assessments/pending', () => HttpResponse.json({ data: p })),
    http.get('*/api/v1/placement-tests', () => page(t)),
  );

describe('trang chủ giáo viên', () => {
  it('FR-SCH-05: mỗi buổi dạy hôm nay là một thẻ với nút "Điểm danh" dẫn tới /sessions/:id/attendance', async () => {
    stub([session()], [], []);
    renderApp({ route: '/', user: makeUser('TEACHER') });
    expect(await screen.findByRole('heading', { name: 'Hôm nay của tôi' }, T)).toBeInTheDocument();
    const card = await screen.findByRole('article', { name: /A2-TOI/ }, T);
    const link = within(card).getByRole('link', { name: 'Điểm danh' });
    expect(link).toHaveAttribute('href', '/sessions/65000000000000000000c001/attendance');
  });

  it('FR-ATT-02: buổi đã điểm danh hiện "Đã điểm danh", không còn nút Điểm danh', async () => {
    stub([session({ attendanceTakenAt: iso(0) })], [], []);
    renderApp({ route: '/', user: makeUser('TEACHER') });
    const card = await screen.findByRole('article', { name: /A2-TOI/ }, T);
    expect(within(card).getByText('Đã điểm danh')).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Điểm danh' })).not.toBeInTheDocument();
  });

  it('FR-GRD-03: "Bài cần nhập điểm" liệt kê bài chờ → link /assessments/:id/grades', async () => {
    stub([], [pending()], []);
    renderApp({ route: '/', user: makeUser('TEACHER') });
    const link = await screen.findByRole('link', { name: /Kiểm tra giữa kỳ/ }, T);
    expect(link).toHaveAttribute('href', '/assessments/65000000000000000000a101/grades');
    expect(screen.getByText(/Lớp A2 tối/)).toBeInTheDocument();
  });

  it('FR-PLC-02: "Kiểm tra đầu vào sắp tới" liệt kê đợt sắp diễn ra', async () => {
    stub([], [], [placement()]);
    renderApp({ route: '/', user: makeUser('TEACHER') });
    expect(await screen.findByText(/Tiếng Anh A2/, {}, T)).toBeInTheDocument();
    expect(screen.getByText(/P101/)).toBeInTheDocument();
  });

  it('mỗi khối rỗng có thông điệp riêng; h1 hiện ngay cả khi đang tải', async () => {
    stub([], [], []);
    renderApp({ route: '/', user: makeUser('TEACHER') });
    expect(await screen.findByRole('heading', { name: 'Hôm nay của tôi' }, T)).toBeInTheDocument();
    expect(await screen.findByText('Hôm nay không có buổi dạy', {}, T)).toBeInTheDocument();
    expect(await screen.findByText('Không có bài cần nhập điểm', {}, T)).toBeInTheDocument();
    expect(await screen.findByText('Không có đợt kiểm tra sắp tới', {}, T)).toBeInTheDocument();
  });

  it('buổi đã hủy không hiện thẻ điểm danh', async () => {
    stub([session({ status: 'CANCELLED', cancelReason: 'Nghỉ lễ' })], [], []);
    renderApp({ route: '/', user: makeUser('TEACHER') });
    expect(await screen.findByText('Hôm nay không có buổi dạy', {}, T)).toBeInTheDocument();
  });

  it('chỉ lấy đợt SCHEDULED, đợt đã hủy không hiện, và chỉ gọi /placement-tests đúng 1 lần', async () => {
    let calls = 0;
    let statusParam: string | null = null;
    stub([], [], []);
    server.use(
      http.get('*/api/v1/placement-tests', ({ request }) => {
        calls++;
        statusParam = new URL(request.url).searchParams.get('status');
        return page([placement({ status: 'CANCELLED', courseName: 'Khóa đã hủy' })].filter((t) => statusParam !== 'SCHEDULED' || t.status === 'SCHEDULED'));
      }),
    );
    renderApp({ route: '/', user: makeUser('TEACHER') });
    expect(await screen.findByText('Không có đợt kiểm tra sắp tới', {}, T)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(statusParam).toBe('SCHEDULED');
    expect(screen.queryByText('Khóa đã hủy')).not.toBeInTheDocument();
    expect(calls).toBe(1);
  });
});
