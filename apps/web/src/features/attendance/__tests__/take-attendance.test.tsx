import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SessionAttendanceDto, SessionDto } from '@lc/shared';
import { server } from '../../../../test/msw/server';
import { mockViewport, resetViewport } from '../../../../test/media';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const SESSION_ID = '65000000000000000000d001';
const ROUTE = `/sessions/${SESSION_ID}/attendance`;
const FIRST = { timeout: 10_000 };

const session: SessionDto = {
  id: SESSION_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  classId: '65000000000000000000c001',
  roomId: '65000000000000000000a001',
  teacherId: '65000000000000000000b001',
  startAt: '2026-01-13T11:00:00.000Z', // 18:00 T3 13/01 VN
  endAt: '2026-01-13T12:30:00.000Z',
  status: 'SCHEDULED',
  cancelReason: null,
  seriesId: null,
  attendanceTakenAt: null,
  classCode: 'IELTS-01',
  roomName: 'P201',
  teacherName: 'Cô Lan',
};

const row = (i: number, over: Partial<SessionAttendanceDto['roster'][number]> = {}) => ({
  studentId: `6500000000000000000e${String(i).padStart(4, '0')}`,
  enrollmentId: `6500000000000000000f${String(i).padStart(4, '0')}`,
  studentCode: `HV2026${String(i).padStart(4, '0')}`,
  fullName: `Học viên ${i}`,
  status: null,
  note: null,
  history: [],
  absenceRate: 0,
  ...over,
});

const dto = (over: Partial<SessionAttendanceDto> = {}, n = 20): SessionAttendanceDto => ({
  sessionId: SESSION_ID,
  taken: false,
  takenAt: null,
  takenByName: null,
  editable: true,
  sessionNote: null,
  roster: Array.from({ length: n }, (_, i) => row(i + 1)),
  ...over,
});

function mockApi(a: SessionAttendanceDto, threshold = 0.2) {
  server.use(
    http.get('*/api/v1/sessions/:id', () => HttpResponse.json({ data: session })),
    http.get('*/api/v1/sessions/:id/attendance', () => HttpResponse.json({ data: a })),
    http.get('*/api/v1/settings', () =>
      HttpResponse.json({ data: { attendanceWarningThreshold: threshold } }),
    ),
  );
}

const group = (name: string) => screen.getByRole('group', { name: `Trạng thái ${name}` });
const pick = (user: ReturnType<typeof userEvent.setup>, name: string, label: string) =>
  user.click(within(group(name)).getByRole('button', { name: label }));

async function open(a: SessionAttendanceDto, role: 'ACADEMIC_STAFF' | 'TEACHER' | 'MANAGER' = 'TEACHER') {
  mockApi(a);
  const user = userEvent.setup();
  renderApp({ user: makeUser(role), route: ROUTE });
  await screen.findByText('Học viên 1', {}, FIRST);
  return user;
}

afterEach(() => resetViewport());

describe('FR-ATT-01 màn điểm danh', () => {
  it('hiện mã lớp, ngày giờ và "Tất cả có mặt" → mọi HV PRESENT, đếm "Đã chọn 20/20"', async () => {
    const user = await open(dto());
    expect(screen.getByText(/IELTS-01/)).toBeInTheDocument();
    expect(screen.getByText(/Thứ 3 13\/01 18:00/)).toBeInTheDocument();
    expect(screen.getByText('Đã chọn 0/20')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tất cả có mặt' }));
    expect(screen.getByText('Đã chọn 20/20')).toBeInTheDocument();
    expect(within(group('Học viên 7')).getByRole('button', { name: 'Có mặt' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lưu khi thiếu 3 → cảnh báo "Còn 3 học viên chưa điểm danh", không gọi PUT, focus nút HV thiếu đầu tiên', async () => {
    let puts = 0;
    server.use(
      http.put('*/api/v1/sessions/:id/attendance', () => {
        puts += 1;
        return HttpResponse.json({ data: dto() });
      }),
    );
    const user = await open(dto({}, 5));
    await pick(user, 'Học viên 1', 'Có mặt');
    await pick(user, 'Học viên 2', 'Muộn');
    await user.click(screen.getByRole('button', { name: 'Lưu điểm danh' }));
    expect(await screen.findByText('Còn 3 học viên chưa điểm danh')).toBeInTheDocument();
    expect(puts).toBe(0);
    expect(document.activeElement).toBe(within(group('Học viên 3')).getByRole('button', { name: 'Có mặt' }));
  });

  it('đủ → PUT body đúng records + sessionNote', async () => {
    let body: unknown;
    server.use(
      http.put('*/api/v1/sessions/:id/attendance', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: dto() });
      }),
    );
    const user = await open(dto({}, 3));
    await pick(user, 'Học viên 1', 'Có mặt');
    await pick(user, 'Học viên 2', 'Vắng CP');
    await pick(user, 'Học viên 3', 'Vắng KP');
    await user.type(screen.getByLabelText('Ghi chú buổi học'), 'Mất điện 5 phút');
    await user.click(screen.getByRole('button', { name: 'Lưu điểm danh' }));
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      records: [
        { studentId: row(1).studentId, status: 'PRESENT' },
        { studentId: row(2).studentId, status: 'EXCUSED' },
        { studentId: row(3).studentId, status: 'UNEXCUSED' },
      ],
      sessionNote: 'Mất điện 5 phút',
    });
  });

  it('taken=true → chế độ cập nhật: "Đã điểm danh lúc 18:05 14/01 bởi Cô Lan", đổi trạng thái hiện ô lý do, lưu → PATCH chỉ bản ghi đã đổi', async () => {
    let body: unknown;
    server.use(
      http.patch('*/api/v1/sessions/:id/attendance', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: dto() });
      }),
    );
    const taken = dto(
      { taken: true, takenAt: '2026-01-14T11:05:00.000Z', takenByName: 'Cô Lan' },
      3,
    );
    taken.roster = taken.roster.map((r) => ({ ...r, status: 'PRESENT' as const }));
    const user = await open(taken);
    expect(screen.getByText('Đã điểm danh lúc 18:05 14/01 bởi Cô Lan')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Lý do thay đổi/)).not.toBeInTheDocument();
    await pick(user, 'Học viên 2', 'Vắng KP');
    await user.type(screen.getByLabelText('Lý do thay đổi: Học viên 2'), 'Nhầm lần trước');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      records: [{ studentId: row(2).studentId, status: 'UNEXCUSED', reason: 'Nhầm lần trước' }],
    });
  });

  it('xem lịch sử một HV → popover liệt kê history', async () => {
    const taken = dto({ taken: true, takenAt: '2026-01-14T11:05:00.000Z', takenByName: 'Cô Lan' }, 2);
    taken.roster = taken.roster.map((r, i) => ({
      ...r,
      status: 'EXCUSED' as const,
      history:
        i === 0
          ? [
              { from: null, to: 'PRESENT' as const, by: '650000000000000000000001', at: '2026-01-14T11:05:00.000Z' },
              { from: 'PRESENT' as const, to: 'EXCUSED' as const, reason: 'Có giấy xin phép', by: '650000000000000000000001', at: '2026-01-15T02:00:00.000Z' },
            ]
          : [],
    }));
    const user = await open(taken);
    expect(screen.queryByRole('button', { name: 'Lịch sử Học viên 2' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lịch sử Học viên 1' }));
    const list = await screen.findByRole('list', { name: 'Lịch sử điểm danh' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[1]).toHaveTextContent('Có mặt → Vắng có phép');
    expect(items[1]).toHaveTextContent('Có giấy xin phép');
    expect(items[1]).toHaveTextContent('09:00 15/01');
  });

  it('editable=false → mọi nút disabled + thông báo "Đã quá thời hạn chỉnh sửa"', async () => {
    const taken = dto({ taken: true, editable: false, takenAt: '2026-01-14T11:05:00.000Z', takenByName: 'Cô Lan' }, 2);
    taken.roster = taken.roster.map((r) => ({ ...r, status: 'PRESENT' as const }));
    await open(taken);
    expect(screen.getByText('Đã quá thời hạn chỉnh sửa')).toBeInTheDocument();
    for (const b of within(group('Học viên 1')).getAllByRole('button')) expect(b).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tất cả có mặt' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Lưu/ })).not.toBeInTheDocument();
  });

  it('viewport 375 → nút trạng thái có class min-h-11 (≥44px)', async () => {
    mockViewport(375);
    await open(dto({}, 2));
    for (const b of within(group('Học viên 1')).getAllByRole('button')) expect(b).toHaveClass('min-h-11');
  });

  it('absenceRate vượt ngưỡng → "⚠ vắng 30% số buổi"; dưới ngưỡng thì không hiện', async () => {
    const a = dto({}, 2);
    a.roster = [row(1, { absenceRate: 0.3 }), row(2, { absenceRate: 0.1 })];
    await open(a);
    expect(screen.getByText('⚠ vắng 30% số buổi')).toBeInTheDocument();
    expect(screen.queryByText(/vắng 10%/)).not.toBeInTheDocument();
  });

  it('422 ATTENDANCE_TOO_EARLY → thông điệp từ error-messages', async () => {
    server.use(
      http.put('*/api/v1/sessions/:id/attendance', () =>
        HttpResponse.json({ error: { code: 'ATTENDANCE_TOO_EARLY', message: 'x' } }, { status: 422 }),
      ),
    );
    const user = await open(dto({}, 1));
    await user.click(screen.getByRole('button', { name: 'Tất cả có mặt' }));
    await user.click(screen.getByRole('button', { name: 'Lưu điểm danh' }));
    expect(await screen.findByText(/Chưa đến giờ điểm danh/)).toBeInTheDocument();
  });

  it('taken, không hủy, có quyền điểm danh, editable=false → "Đã quá thời hạn chỉnh sửa"; Manager (không có quyền) → trạng thái chỉ xem trung tính', async () => {
    const taken = dto({ taken: true, editable: false, takenAt: '2026-01-14T11:05:00.000Z', takenByName: 'Cô Lan' }, 1);
    taken.roster = taken.roster.map((r) => ({ ...r, status: 'PRESENT' as const }));
    await open(taken, 'MANAGER');
    expect(screen.queryByText('Đã quá thời hạn chỉnh sửa')).not.toBeInTheDocument();
    expect(screen.getByText('Chỉ xem, không thể chỉnh sửa điểm danh')).toBeInTheDocument();
  });

  it('buổi đã hủy (editable=false) → trạng thái chỉ xem trung tính, không báo quá hạn', async () => {
    mockApi(dto({ taken: false, editable: false }, 1));
    server.use(
      http.get('*/api/v1/sessions/:id', () =>
        HttpResponse.json({ data: { ...session, status: 'CANCELLED', cancelReason: 'Nghỉ lễ' } }),
      ),
    );
    renderApp({ user: makeUser('TEACHER'), route: ROUTE });
    await screen.findByText('Học viên 1', {}, FIRST);
    await screen.findByText('Chỉ xem, không thể chỉnh sửa điểm danh');
    expect(screen.queryByText('Đã quá thời hạn chỉnh sửa')).not.toBeInTheDocument();
  });

  it.each([
    ['409 ATTENDANCE_ALREADY_TAKEN', 409, 'ATTENDANCE_ALREADY_TAKEN'],
    ['422 ATTENDANCE_EDIT_WINDOW_CLOSED', 422, 'ATTENDANCE_EDIT_WINDOW_CLOSED'],
  ])('%s → refetch truy vấn điểm danh buổi học', async (_n, status, code) => {
    let gets = 0;
    mockApi(dto({}, 1));
    server.use(
      http.get('*/api/v1/sessions/:id/attendance', () => {
        gets += 1;
        return HttpResponse.json({ data: dto({}, 1) });
      }),
      http.put('*/api/v1/sessions/:id/attendance', () =>
        HttpResponse.json({ error: { code, message: 'x' } }, { status }),
      ),
    );
    const user = userEvent.setup();
    renderApp({ user: makeUser('TEACHER'), route: ROUTE });
    await screen.findByText('Học viên 1', {}, FIRST);
    expect(gets).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Tất cả có mặt' }));
    await user.click(screen.getByRole('button', { name: 'Lưu điểm danh' }));
    await waitFor(() => expect(gets).toBe(2));
  });
});
