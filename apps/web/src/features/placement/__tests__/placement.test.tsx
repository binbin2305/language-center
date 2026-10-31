import { http, HttpResponse } from 'msw';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vnDateTime, vnDay, type EnrollmentDto, PlacementTestDto } from '@lc/shared';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const T = { timeout: 10_000 };
const COURSE = '65000000000000000000c001';
const ROOM = '65000000000000000000a001';
const TEACHER = '65000000000000000000b001';
const TEST_ID = '65000000000000000000e001';
const E1 = '65000000000000000000f001';
const E2 = '65000000000000000000f002';

const test_ = (over: Partial<PlacementTestDto> = {}): PlacementTestDto => ({
  id: TEST_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  courseId: COURSE,
  startAt: '2026-01-10T02:00:00.000Z',
  endAt: '2026-01-10T03:30:00.000Z',
  roomId: ROOM,
  teacherId: TEACHER,
  status: 'SCHEDULED',
  courseName: 'IELTS Foundation',
  roomCode: 'P201',
  teacherName: 'Cô Lan',
  candidates: [
    { enrollmentId: E1, studentId: 's1', studentName: 'Nguyễn An', studentCode: 'HV001', score: null, level: null },
  ],
  ...over,
});

const enrollment = (id: string, name: string): EnrollmentDto =>
  ({ id, studentName: name, studentCode: `HV-${name}`, status: 'PENDING_PLACEMENT' }) as unknown as EnrollmentDto;

const page = (data: unknown[]) => ({ data, meta: { page: 1, limit: 20, total: data.length } });

describe('FR-PLT kiểm tra đầu vào (web)', () => {
  beforeAll(() => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => undefined;
    Element.prototype.releasePointerCapture ??= () => undefined;
  });

  it('FR-PLT-01 danh sách rỗng → EmptyState', async () => {
    renderApp({ user: makeUser('MANAGER'), route: '/admissions/placement' });
    expect(await screen.findByText('Chưa có đợt kiểm tra', {}, T)).toBeInTheDocument();
  });

  it('FR-PLT-01 TEACHER không thấy nút "Tạo đợt", MANAGER thấy', async () => {
    server.use(http.get('*/api/v1/placement-tests', () => HttpResponse.json(page([test_()]))));
    const teacher = renderApp({ user: makeUser('TEACHER'), route: '/admissions/placement' });
    expect(await screen.findByText('IELTS Foundation', {}, T)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tạo đợt/ })).not.toBeInTheDocument();
    teacher.unmount();
    renderApp({ user: makeUser('MANAGER'), route: '/admissions/placement' });
    expect(await screen.findByRole('button', { name: /Tạo đợt/ }, T)).toBeInTheDocument();
  });

  const catalog = () =>
    server.use(
      http.get('*/api/v1/courses', () => HttpResponse.json(page([{ id: COURSE, name: 'IELTS Foundation' }]))),
      http.get('*/api/v1/rooms', () => HttpResponse.json(page([{ id: ROOM, code: 'P201', name: 'Phòng 201' }]))),
      http.get('*/api/v1/teachers', () => HttpResponse.json({ data: [{ id: TEACHER, fullName: 'Cô Lan' }] })),
    );

  async function fillCreateForm() {
    const user = userEvent.setup();
    renderApp({ user: makeUser('MANAGER'), route: '/admissions/placement' });
    await user.click(await screen.findByRole('button', { name: /Tạo đợt/ }, T));
    const dialog = await screen.findByRole('dialog', {}, T);
    const pick = async (label: string, option: string) => {
      await user.click(within(dialog).getByRole('combobox', { name: label }));
      await user.click(await screen.findByRole('option', { name: option }));
    };
    await pick('Khóa học', 'IELTS Foundation');
    await pick('Phòng thi', 'P201 - Phòng 201');
    await pick('Giáo viên chấm', 'Cô Lan');
    await user.click(within(dialog).getByLabelText(/^Ngày thi/));
    await user.click(await screen.findByText('15'));
    fireEvent.change(within(dialog).getByLabelText(/^Giờ bắt đầu/), { target: { value: '09:00' } });
    fireEvent.change(within(dialog).getByLabelText(/^Giờ kết thúc/), { target: { value: '10:30' } });
    return { user, dialog };
  }

  /** The picked day is the 15th of the current month (Vietnam day). */
  const pickedDay = () => {
    const today = vnDay(new Date());
    return `${today.slice(0, 8)}15`;
  };

  it('FR-PLT-01 tạo đợt thành công → POST đúng body startAt/endAt (giờ VN) và đóng dialog', async () => {
    catalog();
    let body: unknown;
    server.use(
      http.post('*/api/v1/placement-tests', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: test_() }, { status: 201 });
      }),
    );
    const { user, dialog } = await fillCreateForm();
    await user.click(within(dialog).getByRole('button', { name: 'Tạo đợt' }));
    await waitFor(() =>
      expect(body).toEqual({
        courseId: COURSE,
        roomId: ROOM,
        teacherId: TEACHER,
        startAt: vnDateTime(pickedDay(), '09:00').toISOString(),
        endAt: vnDateTime(pickedDay(), '10:30').toISOString(),
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('FR-PLT-02 tạo đợt → 409 SCHEDULE_CONFLICT → danh sách xung đột (ngày giờ, loại, lớp), dialog không đóng', async () => {
    catalog();
    server.use(
      http.post('*/api/v1/placement-tests', () =>
        HttpResponse.json(
          {
            error: {
              code: 'SCHEDULE_CONFLICT',
              message: 'conflict',
              details: {
                conflicts: [
                  { sessionId: 's9', kind: 'ROOM', classCode: 'TOEIC-02', startAt: '2026-01-10T02:00:00.000Z', endAt: '2026-01-10T03:30:00.000Z', roomId: ROOM, teacherId: TEACHER },
                ],
              },
            },
          },
          { status: 409 },
        ),
      ),
    );
    const { user, dialog } = await fillCreateForm();
    await user.click(within(dialog).getByRole('button', { name: 'Tạo đợt' }));
    const list = await within(dialog).findByRole('list', { name: 'Danh sách xung đột lịch' });
    expect(within(list).getByText('Trùng phòng')).toBeInTheDocument();
    expect(within(list).getByText(/TOEIC-02/)).toBeInTheDocument();
    expect(within(list).getByText('10/01/2026')).toBeInTheDocument();
    expect(within(list).getByText('09:00 - 10:30')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('FR-PLT-01 chi tiết đợt: "Thêm thí sinh" liệt kê chờ kiểm tra, chọn 2 → POST candidates với 2 id', async () => {
    let body: unknown;
    let query = '';
    server.use(
      http.get('*/api/v1/placement-tests/:id', () => HttpResponse.json({ data: test_() })),
      http.get('*/api/v1/enrollments', ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json(page([enrollment(E1, 'An'), enrollment(E2, 'Bình'), enrollment('65000000000000000000f003', 'Cường')]));
      }),
      http.post('*/api/v1/placement-tests/:id/candidates', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: test_() });
      }),
    );
    const user = userEvent.setup();
    renderApp({ user: makeUser('ACADEMIC_STAFF'), route: `/admissions/placement/${TEST_ID}` });
    await user.click(await screen.findByRole('button', { name: 'Thêm thí sinh' }, T));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('checkbox', { name: 'Bình' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Cường' }));
    // E1 already a candidate: not offered again
    expect(within(dialog).queryByRole('checkbox', { name: 'An' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Thêm vào đợt' }));
    await waitFor(() => expect(body).toEqual({ enrollmentIds: [E2, '65000000000000000000f003'] }));
    expect(query).toContain('status=PENDING_PLACEMENT');
    expect(query).toContain(`courseId=${COURSE}`);
  });

  describe('GV chấm điểm', () => {
    const gradePage = () => {
      server.use(http.get('*/api/v1/placement-tests/:id', () => HttpResponse.json({ data: test_() })));
      renderApp({ user: makeUser('TEACHER'), route: `/admissions/placement/${TEST_ID}/grade` });
    };

    it('FR-PLT-03 nhập 11 → ô viền đỏ (aria-invalid) và nút Lưu disabled', async () => {
      gradePage();
      const input = await screen.findByLabelText('Điểm Nguyễn An', {}, T);
      await userEvent.setup().type(input, '11');
      await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
      expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
    });

    it('FR-PLT-03 nhập 7.3 → đỏ', async () => {
      gradePage();
      const input = await screen.findByLabelText('Điểm Nguyễn An', {}, T);
      await userEvent.setup().type(input, '7.3');
      await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
      expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
    });

    it('FR-PLT-03 nhập 7.25 + level → PUT results đúng body (mảng trần)', async () => {
      let body: unknown;
      server.use(
        http.put('*/api/v1/placement-tests/:id/results', async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ data: test_() });
        }),
      );
      gradePage();
      const user = userEvent.setup();
      await user.type(await screen.findByLabelText('Điểm Nguyễn An', {}, T), '7.25');
      await user.type(screen.getByLabelText('Trình độ Nguyễn An'), 'B1');
      const save = screen.getByRole('button', { name: 'Lưu' });
      await waitFor(() => expect(save).toBeEnabled());
      await user.click(save);
      await waitFor(() => expect(body).toEqual([{ enrollmentId: E1, score: 7.25, level: 'B1' }]));
    });
  });

  it('FR-PLT-03 "Chấm điểm" chỉ hiện cho GV; NVHV không thấy', async () => {
    server.use(http.get('*/api/v1/placement-tests/:id', () => HttpResponse.json({ data: test_() })));
    const staff = renderApp({ user: makeUser('ACADEMIC_STAFF'), route: `/admissions/placement/${TEST_ID}` });
    expect(await screen.findByRole('button', { name: 'Thêm thí sinh' }, T)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Chấm điểm' })).not.toBeInTheDocument();
    staff.unmount();
    renderApp({ user: makeUser('TEACHER'), route: `/admissions/placement/${TEST_ID}` });
    expect(await screen.findByRole('link', { name: 'Chấm điểm' }, T)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm thí sinh' })).not.toBeInTheDocument();
  });

  it('FR-PLT-03 đợt đã COMPLETED → ô nhập bị khóa, không lưu được', async () => {
    server.use(http.get('*/api/v1/placement-tests/:id', () => HttpResponse.json({ data: test_({ status: 'COMPLETED' }) })));
    renderApp({ user: makeUser('TEACHER'), route: `/admissions/placement/${TEST_ID}/grade` });
    expect(await screen.findByLabelText('Điểm Nguyễn An', {}, T)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });
});
