import { http, HttpResponse } from 'msw';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SessionConflictDto, SessionDto } from '@lc/shared';
import { server } from '../../../../test/msw/server';
import { mockViewport } from '../../../../test/media';
import { renderApp, renderWithProviders } from '../../../../test/render';
import { makeUser } from '../../../../test/users';
import { countRecurrence } from '../recurrence-preview';
import { SessionFormDialog } from '../components/session-form-dialog';

const CLASS_ID = '65000000000000000000c001';
const ROOM_ID = '65000000000000000000a001';
const TEACHER_ID = '65000000000000000000b001';
const SESSION_ID = '65000000000000000000d001';

const session = (over: Partial<SessionDto> = {}): SessionDto => ({
  id: SESSION_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  classId: CLASS_ID,
  roomId: ROOM_ID,
  teacherId: TEACHER_ID,
  startAt: '2026-01-06T11:00:00.000Z',
  endAt: '2026-01-06T12:30:00.000Z',
  status: 'SCHEDULED',
  cancelReason: null,
  seriesId: null,
  attendanceTakenAt: null,
  classCode: 'IELTS-01',
  roomName: 'P201',
  teacherName: 'Cô Lan',
  ...over,
});

const conflict: SessionConflictDto = {
  sessionId: '65000000000000000000d002',
  kind: 'ROOM',
  classCode: 'TOEIC-02',
  startAt: '2026-01-05T11:00:00.000Z',
  endAt: '2026-01-05T12:30:00.000Z',
  roomId: ROOM_ID,
  teacherId: TEACHER_ID,
};

const mockSessions = (list: SessionDto[]) =>
  server.use(http.get('*/api/v1/sessions', () => HttpResponse.json({ data: list })));
const mockCheck = (conflicts: SessionConflictDto[]) =>
  server.use(http.post('*/api/v1/sessions/check-conflicts', () => HttpResponse.json({ data: { conflicts } })));

const DEFAULTS = { classId: CLASS_ID, roomId: ROOM_ID, teacherId: TEACHER_ID, fromDate: '2026-01-05', toDate: '2026-01-30' };

async function openRecurring() {
  const user = userEvent.setup();
  renderWithProviders(<SessionFormDialog open onOpenChange={() => undefined} defaults={DEFAULTS} />, {
    user: makeUser('MANAGER'),
  });
  await user.click(screen.getByRole('tab', { name: 'Lặp lại' }));
  for (const d of ['T2', 'T4', 'T6']) await user.click(screen.getByRole('button', { name: d }));
  fireEvent.change(screen.getByLabelText(/^Giờ bắt đầu/), { target: { value: '18:00' } });
  fireEvent.change(screen.getByLabelText(/^Giờ kết thúc/), { target: { value: '19:30' } });
  return user;
}

describe('FR-SCH-02 xem trước số buổi lặp', () => {
  it('countRecurrence khớp expandWeekly: ngày trùng gộp, đầu-cuối đều tính', () => {
    expect(countRecurrence({ weekdays: [1, 3, 5], fromDate: '2026-01-05', toDate: '2026-01-30' })).toBe(12);
    expect(countRecurrence({ weekdays: [1, 1, 3], fromDate: '2026-01-01', toDate: '2026-01-31' })).toBe(8);
    expect(countRecurrence({ weekdays: [1], fromDate: '2026-01-05', toDate: '2026-01-05' })).toBe(1);
    expect(countRecurrence({ weekdays: [1], fromDate: '2026-01-06', toDate: '2026-01-05' })).toBe(0);
  });

  it('dialog Lặp lại chọn T2,T4,T6 18:00–19:30 05/01–30/01/2026 → "Sẽ tạo 12 buổi"', async () => {
    await openRecurring();
    expect(await screen.findByText('Sẽ tạo 12 buổi')).toBeInTheDocument();
  });
});

describe('FR-SCH-03 kiểm tra xung đột trước khi tạo', () => {
  it('có xung đột → ConflictList hiển thị và nút "Tạo" disabled', async () => {
    mockCheck([conflict]);
    const user = await openRecurring();
    await user.click(screen.getByRole('button', { name: 'Kiểm tra xung đột' }));
    expect(await screen.findByLabelText('Danh sách xung đột lịch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeDisabled();
  });

  it('đổi giờ sau khi có xung đột → nút Tạo vẫn disabled tới khi kiểm tra lại', async () => {
    mockCheck([conflict]);
    const user = await openRecurring();
    await user.click(screen.getByRole('button', { name: 'Kiểm tra xung đột' }));
    await screen.findByLabelText('Danh sách xung đột lịch');
    mockCheck([]);
    fireEvent.change(screen.getByLabelText(/^Giờ bắt đầu/), { target: { value: '20:00' } });
    fireEvent.change(screen.getByLabelText(/^Giờ kết thúc/), { target: { value: '21:30' } });
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Kiểm tra xung đột' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo' })).toBeEnabled());
  });

  it('kiểm tra sạch rồi sửa form → Tạo bị khóa lại', async () => {
    mockCheck([]);
    const user = await openRecurring();
    await user.click(screen.getByRole('button', { name: 'Kiểm tra xung đột' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'T6' }));
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeDisabled();
  });

  it('tạo thành công gọi POST /sessions/bulk với thứ ISO và giờ HH:mm', async () => {
    mockCheck([]);
    let body: unknown;
    server.use(
      http.post('*/api/v1/sessions/bulk', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { seriesId: CLASS_ID, sessions: [], warnings: [] } }, { status: 201 });
      }),
    );
    const user = await openRecurring();
    await user.click(screen.getByRole('button', { name: 'Kiểm tra xung đột' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Tạo' }));
    await waitFor(() =>
      expect(body).toEqual({
        classId: CLASS_ID, roomId: ROOM_ID, teacherId: TEACHER_ID,
        weekdays: [1, 3, 5], startTime: '18:00', endTime: '19:30', fromDate: '2026-01-05', toDate: '2026-01-30',
      }),
    );
  });
});

describe('màn hình Lịch', () => {
  it('GET /sessions trả [] → "Chưa có lịch học"', async () => {
    mockSessions([]);
    renderApp({ route: '/schedule', user: makeUser('MANAGER') });
    expect(await screen.findByText('Chưa có lịch học')).toBeInTheDocument();
  });

  it('TEACHER không thấy nút "Tạo lịch", MANAGER thấy', async () => {
    mockSessions([]);
    const { unmount } = renderApp({ route: '/schedule', user: makeUser('TEACHER') });
    await screen.findByText('Chưa có lịch học');
    expect(screen.queryByRole('button', { name: 'Tạo lịch' })).not.toBeInTheDocument();
    unmount();
    renderApp({ route: '/schedule', user: makeUser('MANAGER') });
    expect(await screen.findByRole('button', { name: 'Tạo lịch' })).toBeInTheDocument();
  });

  it('viewport 375px → mặc định chế độ danh sách (listWeek)', async () => {
    mockViewport(375);
    mockSessions([session()]);
    const { container } = renderApp({ route: '/schedule?date=2026-01-06', user: makeUser('MANAGER') });
    await screen.findByText(/IELTS-01/);
    expect(container.querySelector('.fc-list')).not.toBeNull();
  });

  it('hủy buổi → ReasonDialog, lý do rỗng không cho xác nhận, rồi POST cancel', async () => {
    mockViewport(375);
    mockSessions([session()]);
    let body: unknown;
    server.use(
      http.post(`*/api/v1/sessions/${SESSION_ID}/cancel`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: session({ status: 'CANCELLED', cancelReason: 'Giáo viên nghỉ ốm' }) });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/schedule?date=2026-01-06', user: makeUser('MANAGER') });
    await user.click(await screen.findByText(/IELTS-01/));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Hủy buổi' }));
    const reason = await screen.findByRole('dialog', { name: 'Hủy buổi học' });
    const confirm = within(reason).getByRole('button', { name: 'Xác nhận hủy' });
    expect(confirm).toBeDisabled();
    await user.type(within(reason).getByLabelText('Lý do'), 'Giáo viên nghỉ ốm');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(body).toEqual({ reason: 'Giáo viên nghỉ ốm' }));
  });

  it('GV thấy "Điểm danh" nhưng không có Sửa/Hủy buổi', async () => {
    mockViewport(375);
    mockSessions([session()]);
    const user = userEvent.setup();
    renderApp({ route: '/schedule?date=2026-01-06', user: makeUser('TEACHER') });
    await user.click(await screen.findByText(/IELTS-01/));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByRole('link', { name: 'Điểm danh' })).toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Hủy buổi' })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
  });

  it('lỗi tải → ErrorState có nút Thử lại', async () => {
    server.use(http.get('*/api/v1/sessions', () => HttpResponse.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 })));
    renderApp({ route: '/schedule', user: makeUser('MANAGER') });
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});

describe('tab Lịch học trong lớp', () => {
  it('gọi GET /sessions?classId=…', async () => {
    let classId: string | null = null;
    server.use(
      http.get('*/api/v1/sessions', ({ request }) => {
        classId = new URL(request.url).searchParams.get('classId');
        return HttpResponse.json({ data: [] });
      }),
      http.get(`*/api/v1/classes/${CLASS_ID}`, () => HttpResponse.json({ data: { id: CLASS_ID } })),
    );
    renderApp({ route: `/classes/${CLASS_ID}?tab=schedule`, user: makeUser('MANAGER') });
    await waitFor(() => expect(classId).toBe(CLASS_ID));
    expect(await screen.findByText('Chưa có lịch học')).toBeInTheDocument();
  });
});
