import { http, HttpResponse } from 'msw';
import { screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AttendanceDto, AttendanceSummaryRowDto, SessionDto } from '@lc/shared';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const FIRST = { timeout: 10_000 };
const CLASS_ID = '65000000000000000000c001';
const S1 = '6500000000000000000e0001';
const S2 = '6500000000000000000e0002';
const base = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

const summaryRow = (over: Partial<AttendanceSummaryRowDto> = {}): AttendanceSummaryRowDto => ({
  key: S1,
  label: 'Nguyễn Văn A',
  PRESENT: 6,
  LATE: 1,
  EXCUSED: 1,
  UNEXCUSED: 0,
  total: 8,
  attendanceRate: 0.75,
  absenceRate: 0.25,
  ...over,
});

const rec = (sessionId: string, studentId: string, status: AttendanceDto['status'], at: string): AttendanceDto => ({
  ...base,
  id: `${sessionId}${studentId}`.slice(0, 24),
  sessionId,
  classId: CLASS_ID,
  studentId,
  enrollmentId: '6500000000000000000f0001',
  status,
  recordedBy: '650000000000000000000001',
  history: [],
  sessionStartAt: at,
  studentName: studentId === S1 ? 'Nguyễn Văn A' : 'Trần Thị B',
  classCode: 'IELTS-01',
});

const page = (data: unknown[]) =>
  HttpResponse.json({ data, meta: { page: 1, limit: 100, total: data.length } });

const cls = {
  ...base,
  id: CLASS_ID,
  code: 'IELTS-01',
  name: 'IELTS Foundation 01',
  courseId: '65000000000000000000d001',
  courseName: 'IELTS',
  level: 'Foundation',
  teacherId: '65000000000000000000b001',
  teacherName: 'Cô Lan',
  defaultRoomId: null,
  maxCapacity: 20,
  currentSize: 2,
  startDate: '2026-01-05',
  endDate: '2026-04-05',
  status: 'ONGOING',
};

describe('FR-ATT-05 lịch sử điểm danh /attendance', () => {
  it('lọc lớp + khoảng ngày → GET /attendance/summary?groupBy=student&classId=…&from=…&to=…', async () => {
    const urls: URL[] = [];
    server.use(
      http.get('*/api/v1/classes', () => page([cls])),
      http.get('*/api/v1/attendance/summary', ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json({ data: [summaryRow()] });
      }),
    );
    const user = userEvent.setup();
    renderApp({ user: makeUser('ACADEMIC_STAFF'), route: '/attendance' });
    await screen.findByText('Nguyễn Văn A', {}, FIRST);
    await user.click(screen.getByRole('combobox', { name: 'Lớp' }));
    await user.click(await screen.findByText(/IELTS-01/));
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-01-31' } });
    await screen.findByText('Nguyễn Văn A');
    await vi.waitFor(() => {
      const q = urls.at(-1)!.searchParams;
      expect(q.get('groupBy')).toBe('student');
      expect(q.get('classId')).toBe(CLASS_ID);
      expect(q.get('from')).toBe('2026-01-01');
      expect(q.get('to')).toBe('2026-01-31');
    });
  });

  it('bảng tổng hợp hiển thị Có mặt/Muộn/Vắng CP/Vắng KP/Tỷ lệ "75%"', async () => {
    server.use(http.get('*/api/v1/attendance/summary', () => HttpResponse.json({ data: [summaryRow()] })));
    renderApp({ user: makeUser('ACADEMIC_STAFF'), route: '/attendance' });
    const row = (await screen.findByText('Nguyễn Văn A', {}, FIRST)).closest('tr')!;
    for (const h of ['Có mặt', 'Muộn', 'Vắng CP', 'Vắng KP', 'Tỷ lệ chuyên cần'])
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Nguyễn Văn A', '6', '1', '1', '0', '75%']);
  });

  it('click dòng → danh sách buổi của HV (GET /attendance?studentId=…)', async () => {
    let studentId: string | null = null;
    server.use(
      http.get('*/api/v1/attendance/summary', () => HttpResponse.json({ data: [summaryRow()] })),
      http.get('*/api/v1/attendance', ({ request }) => {
        studentId = new URL(request.url).searchParams.get('studentId');
        return page([rec('6500000000000000000d0001', S1, 'LATE', '2026-01-13T11:00:00.000Z')]);
      }),
    );
    const user = userEvent.setup();
    renderApp({ user: makeUser('MANAGER'), route: '/attendance' });
    await user.click(await screen.findByRole('button', { name: /Nguyễn Văn A/ }, FIRST));
    const list = await screen.findByRole('list', { name: 'Các buổi của Nguyễn Văn A' });
    expect(within(list).getByText(/Thứ 3 13\/01 18:00/)).toBeInTheDocument();
    expect(within(list).getByText('Đi muộn')).toBeInTheDocument();
    expect(studentId).toBe(S1);
  });

  it('rỗng → "Chưa có dữ liệu điểm danh"', async () => {
    server.use(http.get('*/api/v1/attendance/summary', () => HttpResponse.json({ data: [] })));
    renderApp({ user: makeUser('TEACHER'), route: '/attendance' });
    expect(await screen.findByText('Chưa có dữ liệu điểm danh', {}, FIRST)).toBeInTheDocument();
  });
});

describe('FR-ATT-05 /me/attendance', () => {
  it('thẻ tỷ lệ + danh sách buổi', async () => {
    server.use(
      http.get('*/api/v1/attendance/summary', () => HttpResponse.json({ data: [summaryRow()] })),
      http.get('*/api/v1/attendance', () =>
        page([
          rec('6500000000000000000d0001', S1, 'PRESENT', '2026-01-13T11:00:00.000Z'),
          rec('6500000000000000000d0002', S1, 'UNEXCUSED', '2026-01-15T11:00:00.000Z'),
        ]),
      ),
    );
    renderApp({ user: makeUser('STUDENT'), route: '/me/attendance' });
    expect(await screen.findByText('75%', {}, FIRST)).toBeInTheDocument();
    expect(screen.getByText('Tỷ lệ chuyên cần')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Các buổi đã học' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Có mặt')).toBeInTheDocument();
    expect(within(list).getByText('Vắng không phép')).toBeInTheDocument();
  });

  it('rỗng → "Chưa có dữ liệu điểm danh"', async () => {
    server.use(http.get('*/api/v1/attendance/summary', () => HttpResponse.json({ data: [] })));
    renderApp({ user: makeUser('STUDENT'), route: '/me/attendance' });
    expect(await screen.findByText('Chưa có dữ liệu điểm danh', {}, FIRST)).toBeInTheDocument();
  });
});

describe('FR-ATT-05 tab Điểm danh của lớp (ma trận)', () => {
  const sess = (id: string, startAt: string, over: Partial<SessionDto> = {}): SessionDto => ({
    ...base,
    id,
    classId: CLASS_ID,
    roomId: '65000000000000000000a001',
    teacherId: '65000000000000000000b001',
    startAt,
    endAt: startAt,
    status: 'SCHEDULED',
    cancelReason: null,
    seriesId: null,
    attendanceTakenAt: null,
    ...over,
  });
  const D1 = '6500000000000000000d0001';
  const D2 = '6500000000000000000d0002';

  it('hàng HV × cột buổi, ô có data-status theo trạng thái, buổi chưa điểm danh ô trống; gọi /sessions với khoảng ≤ 92 ngày', async () => {
    let range: [string | null, string | null] = [null, null];
    server.use(
      http.get('*/api/v1/classes/:id', () => HttpResponse.json({ data: cls })),
      http.get('*/api/v1/sessions', ({ request }) => {
        const q = new URL(request.url).searchParams;
        range = [q.get('from'), q.get('to')];
        return HttpResponse.json({
          data: [sess(D1, '2026-01-13T11:00:00.000Z'), sess(D2, '2026-01-15T11:00:00.000Z')],
        });
      }),
      http.get('*/api/v1/attendance', () =>
        page([
          rec(D1, S1, 'PRESENT', '2026-01-13T11:00:00.000Z'),
          rec(D1, S2, 'EXCUSED', '2026-01-13T11:00:00.000Z'),
        ]),
      ),
    );
    renderApp({ user: makeUser('ACADEMIC_STAFF'), route: `/classes/${CLASS_ID}?tab=attendance` });
    const matrix = await screen.findByRole('table', { name: 'Ma trận điểm danh' }, FIRST);
    expect(within(matrix).getAllByRole('columnheader')).toHaveLength(3); // HV + 2 buổi
    const a = within(matrix).getByText('Nguyễn Văn A').closest('tr')!;
    const b = within(matrix).getByText('Trần Thị B').closest('tr')!;
    const cellsA = within(a).getAllByRole('cell');
    expect(cellsA[1]).toHaveAttribute('data-status', 'PRESENT');
    expect(cellsA[2]).toHaveAttribute('data-status', 'NONE');
    expect(cellsA[2]).toBeEmptyDOMElement();
    expect(within(b).getAllByRole('cell')[1]).toHaveAttribute('data-status', 'EXCUSED');
    expect(range[0]).toBe('2026-01-05');
    expect(range[1]).toBe('2026-04-05');
  });
});

describe('FR-ATT-05 tab Chuyên cần của HV', () => {
  it('tổng hợp theo lớp (groupBy=class&studentId) + danh sách buổi', async () => {
    let q: URLSearchParams | undefined;
    server.use(
      http.get('*/api/v1/students/:id', () =>
        HttpResponse.json({ data: { ...base, id: S1, code: 'HV20260001', fullName: 'Nguyễn Văn A', status: 'ACTIVE' } }),
      ),
      http.get('*/api/v1/attendance/summary', ({ request }) => {
        q = new URL(request.url).searchParams;
        return HttpResponse.json({ data: [summaryRow({ key: CLASS_ID, label: 'IELTS-01' })] });
      }),
      http.get('*/api/v1/attendance', () => page([rec(D, S1, 'PRESENT', '2026-01-13T11:00:00.000Z')])),
    );
    renderApp({ user: makeUser('ACADEMIC_STAFF'), route: `/students/${S1}?tab=attendance` });
    expect(await screen.findByText('IELTS-01', {}, FIRST)).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(q?.get('groupBy')).toBe('class');
    expect(q?.get('studentId')).toBe(S1);
  });
});
const D = '6500000000000000000d0001';
