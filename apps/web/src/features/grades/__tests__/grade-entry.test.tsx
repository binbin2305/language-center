import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const CLASS_ID = '65000000000000000000c001';
const ASSESSMENT_ID = '65000000000000000000a001';
const S1 = '65000000000000000000b001';
const S2 = '65000000000000000000b002';
const S3 = '65000000000000000000b003';
const WAIT = { timeout: 10_000 };

const assessment = (over: Record<string, unknown> = {}) => ({
  id: ASSESSMENT_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  classId: CLASS_ID,
  name: 'Giữa kỳ',
  type: 'MIDTERM',
  weight: 30,
  heldOn: '2026-02-01',
  confirmedAt: null,
  unlockedUntil: null,
  lockedAt: '2026-02-08T17:00:00.000Z',
  isLocked: false,
  ...over,
});
const row = (studentId: string, n: number, over: Record<string, unknown> = {}) => ({
  studentId,
  enrollmentId: `65000000000000000000f00${n}`,
  studentCode: `HV00${n}`,
  studentName: `Học viên ${n}`,
  score: null,
  comment: null,
  isDraft: true,
  left: false,
  history: [],
  ...over,
});
const mockGrades = (a: Record<string, unknown>, rows: unknown[]) =>
  server.use(http.get('*/api/v1/assessments/:id/grades', () => HttpResponse.json({ data: { assessment: assessment(a), rows } })));
const open = (role: 'TEACHER' | 'ACADEMIC_STAFF' = 'TEACHER') =>
  renderApp({ route: `/assessments/${ASSESSMENT_ID}/grades`, user: makeUser(role) });
const scoreInput = (n: number) => screen.findByLabelText(`Điểm Học viên ${n}`, {}, WAIT);

describe('nhập điểm', () => {
  it('Tab và Enter chuyển focus sang ô điểm HV kế tiếp', async () => {
    mockGrades({}, [row(S1, 1), row(S2, 2), row(S3, 3)]);
    open();
    const user = userEvent.setup();
    const first = await scoreInput(1);
    await user.click(first);
    await user.keyboard('{Tab}');
    expect(screen.getByLabelText('Điểm Học viên 2')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Điểm Học viên 3')).toHaveFocus();
  });

  it('nhập 10.5 → ô aria-invalid + tooltip "Điểm từ 0 đến 10, bước 0.25"', async () => {
    mockGrades({}, [row(S1, 1)]);
    open();
    const user = userEvent.setup();
    const input = await scoreInput(1);
    await user.type(input, '10.5');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('title', 'Điểm từ 0 đến 10, bước 0.25');
  });

  it('Xác nhận khi thiếu 2 → dialog "Còn 2 học viên chưa có điểm. Lưu nháp?" → đồng ý gửi PUT confirm:false', async () => {
    mockGrades({}, [row(S1, 1), row(S2, 2), row(S3, 3)]);
    let body: { confirm: boolean; grades: { studentId: string; score: number | null }[] } | null = null;
    server.use(
      http.put('*/api/v1/assessments/:id/grades', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ data: { assessment: assessment(), rows: [] } });
      }),
    );
    open();
    const user = userEvent.setup();
    await user.type(await scoreInput(1), '8.5');
    await user.click(screen.getByRole('button', { name: 'Xác nhận kết quả' }));
    expect(await screen.findByText('Còn 2 học viên chưa có điểm. Lưu nháp?')).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.confirm).toBe(false);
    expect(body!.grades.find((g) => g.studentId === S1)?.score).toBe(8.5);
  });

  it('đủ điểm → PUT confirm:true', async () => {
    mockGrades({}, [row(S1, 1, { score: 7 }), row(S2, 2, { score: 9 })]);
    let body: { confirm: boolean } | null = null;
    server.use(
      http.put('*/api/v1/assessments/:id/grades', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ data: { assessment: assessment(), rows: [] } });
      }),
    );
    open();
    const user = userEvent.setup();
    await scoreInput(1);
    await user.click(screen.getByRole('button', { name: 'Xác nhận kết quả' }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.confirm).toBe(true);
  });

  it('isLocked → banner "Bảng điểm đã đóng, không thể chỉnh sửa", input disabled', async () => {
    mockGrades({ isLocked: true, confirmedAt: '2026-02-02T00:00:00.000Z' }, [row(S1, 1, { score: 7, isDraft: false })]);
    open();
    expect(await screen.findByText('Bảng điểm đã đóng, không thể chỉnh sửa', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByLabelText('Điểm Học viên 1')).toBeDisabled();
  });

  it('sau confirm sửa một ô → ReasonDialog → PATCH /assessments/:id/grades/:studentId có reason', async () => {
    mockGrades({ confirmedAt: '2026-02-02T00:00:00.000Z' }, [row(S1, 1, { score: 7, isDraft: false })]);
    let body: { score: number; reason: string } | null = null;
    server.use(
      http.patch('*/api/v1/assessments/:id/grades/:studentId', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ data: row(S1, 1, { score: 8 }) });
      }),
    );
    open();
    const user = userEvent.setup();
    const input = await scoreInput(1);
    await user.clear(input);
    await user.type(input, '8');
    await user.click(screen.getByRole('button', { name: 'Sửa điểm Học viên 1' }));
    await user.type(await screen.findByLabelText('Lý do'), 'Chấm lại bài');
    await user.click(screen.getByRole('button', { name: 'Gửi' }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({ score: 8, reason: 'Chấm lại bài' });
  });

  it('S không thấy ô nhập (chỉ xem)', async () => {
    mockGrades({}, [row(S1, 1, { score: 7 })]);
    open('ACADEMIC_STAFF');
    expect(await screen.findByText('Học viên 1', {}, WAIT)).toBeInTheDocument();
    expect(screen.queryByLabelText('Điểm Học viên 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận kết quả' })).not.toBeInTheDocument();
  });
});

const mockClass = () =>
  server.use(
    http.get('*/api/v1/classes/:id', () =>
      HttpResponse.json({
        data: {
          id: CLASS_ID, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
          code: 'IELTS-01', name: 'IELTS 01', courseId: 'c', courseName: 'IELTS', level: 'F', teacherId: 't',
          teacherName: 'Cô Lan', maxCapacity: 20, currentSize: 1, startDate: '2026-01-05', endDate: '2026-04-05', status: 'ONGOING',
        },
      }),
    ),
  );

describe('tab Bài đánh giá', () => {
  beforeEach(mockClass);

  it('hiển thị "85/100%" và badge Nháp/Đã xác nhận/Đã khóa', async () => {
    server.use(
      http.get('*/api/v1/classes/:id/assessments', () =>
        HttpResponse.json({
          data: [
            assessment({ id: 'a1', name: 'Bài 1', weight: 25 }),
            assessment({ id: 'a2', name: 'Bài 2', weight: 30, confirmedAt: '2026-02-02T00:00:00.000Z' }),
            assessment({ id: 'a3', name: 'Bài 3', weight: 30, confirmedAt: '2026-02-02T00:00:00.000Z', isLocked: true }),
          ],
        }),
      ),
    );
    renderApp({ route: `/classes/${CLASS_ID}?tab=assessments`, user: makeUser('TEACHER') });
    expect(await screen.findByText('85/100%', {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText('Nháp')).toBeInTheDocument();
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument();
    expect(screen.getByText('Đã khóa')).toBeInTheDocument();
  });

  it('tạo bài vượt 100 → 422 → lỗi dưới ô Trọng số', async () => {
    server.use(
      http.get('*/api/v1/classes/:id/assessments', () => HttpResponse.json({ data: [] })),
      http.post('*/api/v1/classes/:id/assessments', () =>
        HttpResponse.json(
          { error: { code: 'WEIGHT_EXCEEDS_100', message: 'x', details: { currentTotal: 90 } } },
          { status: 422 },
        ),
      ),
    );
    renderApp({ route: `/classes/${CLASS_ID}?tab=assessments`, user: makeUser('TEACHER') });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Thêm bài đánh giá' }, WAIT));
    await user.type(await screen.findByLabelText(/Tên bài/), 'Bài mới');
    await user.type(screen.getByLabelText(/Trọng số/), '20');
    await user.type(screen.getByLabelText(/Ngày kiểm tra/), '2026-02-01');
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    const err = await screen.findByText(/Tổng trọng số vượt quá 100%/);
    expect(screen.getByLabelText(/Trọng số/)).toHaveAttribute('aria-invalid', 'true');
    expect(err).toBeInTheDocument();
  });
});
