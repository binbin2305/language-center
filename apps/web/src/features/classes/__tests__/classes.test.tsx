import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const CLASS_ID = '65000000000000000000c001';
const COURSE_ID = '65000000000000000000d001';
const TEACHER_ID = '65000000000000000000e001';

const cls = (over: Record<string, unknown> = {}) => ({
  id: CLASS_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  code: 'IELTS-01',
  name: 'IELTS Foundation 01',
  courseId: COURSE_ID,
  courseName: 'IELTS',
  level: 'Foundation',
  teacherId: TEACHER_ID,
  teacherName: 'Cô Lan',
  defaultRoomId: null,
  maxCapacity: 20,
  currentSize: 18,
  startDate: '2026-01-05',
  endDate: '2026-04-05',
  status: 'ONGOING',
  ...over,
});
const meta = (total: number) => ({ page: 1, limit: 20, total });
const page = (data: unknown[]) => HttpResponse.json({ data, meta: meta(data.length) });

const mockCatalog = () =>
  server.use(
    http.get('*/api/v1/teachers', () => page([{ id: TEACHER_ID, fullName: 'Cô Lan' }])),
    http.get('*/api/v1/courses', () => page([{ id: COURSE_ID, code: 'IELTS', name: 'IELTS' }])),
    http.get('*/api/v1/rooms', () => page([])),
  );

describe('danh sách lớp', () => {
  it('CapacityBar 20/20 có màu đỏ khi lớp đầy', async () => {
    mockCatalog();
    server.use(http.get('*/api/v1/classes', () => page([cls({ currentSize: 20 })])));
    renderApp({ route: '/classes', user: makeUser('MANAGER') });
    const bar = await screen.findByRole('progressbar', { name: 'Sĩ số' }, { timeout: 5000 });
    expect(bar).toHaveAttribute('aria-valuenow', '20');
    expect(within(bar).getByTestId('capacity-fill')).toHaveClass('bg-destructive');
  });

  it('TEACHER không thấy nút "Thêm lớp", MANAGER thấy', async () => {
    mockCatalog();
    server.use(http.get('*/api/v1/classes', () => page([cls()])));
    const first = renderApp({ route: '/classes', user: makeUser('TEACHER') });
    await screen.findByText('IELTS-01');
    expect(screen.queryByRole('button', { name: 'Thêm lớp' })).not.toBeInTheDocument();
    first.unmount();
    renderApp({ route: '/classes', user: makeUser('MANAGER') });
    expect(await screen.findByRole('button', { name: 'Thêm lớp' })).toBeInTheDocument();
  });
});

describe('chi tiết lớp', () => {
  const setup = () => {
    mockCatalog();
    server.use(
      http.get('*/api/v1/classes/:id', () => HttpResponse.json({ data: cls() })),
      http.get('*/api/v1/classes/:id/students', () => page([])),
    );
  };

  it('dialog sửa: max 15 khi currentSize 18 báo lỗi trên trường và không gọi PATCH', async () => {
    setup();
    let patched = false;
    server.use(
      http.patch('*/api/v1/classes/:id', () => {
        patched = true;
        return HttpResponse.json({ data: cls() });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: `/classes/${CLASS_ID}`, user: makeUser('ACADEMIC_STAFF') });
    await user.click(await screen.findByRole('button', { name: 'Tùy chọn lớp' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Sửa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa lớp học' }, { timeout: 5000 });
    const max = within(dialog).getByLabelText(/Sĩ số tối đa/);
    await user.clear(max);
    await user.type(max, '15');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(
      await within(dialog).findByText('Sĩ số tối đa không được nhỏ hơn sĩ số hiện tại (18)'),
    ).toBeInTheDocument();
    expect(max).toHaveAttribute('aria-invalid', 'true');
    expect(patched).toBe(false);
  });

  it('xóa bị 422 hiện lý do và gợi ý chuyển sang Ngừng hoạt động', async () => {
    setup();
    let deactivated = false;
    server.use(
      http.delete('*/api/v1/classes/:id', () =>
        HttpResponse.json(
          {
            error: {
              code: 'CLASS_HAS_DEPENDENCIES',
              message: 'x',
              details: { reasons: ['ACTIVE_STUDENTS', 'SESSIONS'] },
            },
          },
          { status: 422 },
        ),
      ),
      http.post('*/api/v1/classes/:id/deactivate', () => {
        deactivated = true;
        return HttpResponse.json({ data: cls({ status: 'INACTIVE' }) });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: `/classes/${CLASS_ID}`, user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Tùy chọn lớp' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Xóa' }));
    await user.click(await screen.findByRole('button', { name: 'Xóa lớp' }));
    expect(await screen.findByText('Còn học viên đang học')).toBeInTheDocument();
    expect(screen.getByText('Đã có buổi học')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Chuyển sang Ngừng hoạt động' }));
    await waitFor(() => expect(deactivated).toBe(true));
  });

  it('tab Học viên hiện ⚠ cho dòng warning: true', async () => {
    mockCatalog();
    const row = (n: number, warning: boolean) => ({
      studentId: `65000000000000000000a00${n}`,
      enrollmentId: `65000000000000000000b00${n}`,
      studentCode: `HV202600${n}`,
      fullName: `Học viên ${n}`,
      absenceRate: warning ? 0.3 : 0,
      warning,
    });
    server.use(
      http.get('*/api/v1/classes/:id', () => HttpResponse.json({ data: cls() })),
      http.get('*/api/v1/classes/:id/students', () => page([row(1, true), row(2, false)])),
    );
    renderApp({ route: `/classes/${CLASS_ID}`, user: makeUser('MANAGER') });
    const warned = (await screen.findByText('Học viên 1')).closest('tr') as HTMLElement;
    expect(within(warned).getByLabelText('Cảnh báo vắng nhiều')).toBeInTheDocument();
    const ok = screen.getByText('Học viên 2').closest('tr') as HTMLElement;
    expect(within(ok).queryByLabelText('Cảnh báo vắng nhiều')).not.toBeInTheDocument();
  });
});

describe('chi tiết lớp theo vai trò', () => {
  it.each(['TEACHER', 'MANAGER'] as const)(
    '%s thấy Phòng từ defaultRoomName (R22), không gọi GET /rooms',
    async (role) => {
      let roomsCalled = false;
      server.use(
        http.get('*/api/v1/rooms', () => {
          roomsCalled = true;
          return page([]);
        }),
        http.get('*/api/v1/classes/:id', () =>
          HttpResponse.json({ data: cls({ defaultRoomId: '65000000000000000000a0a0', defaultRoomName: 'Phòng 101' }) }),
        ),
        http.get('*/api/v1/classes/:id/students', () => page([])),
      );
      renderApp({ route: `/classes/${CLASS_ID}`, user: makeUser(role) });
      const label = await screen.findByText('Phòng', {}, { timeout: 5000 });
      expect(label.nextElementSibling).toHaveTextContent('Phòng 101');
      expect(roomsCalled).toBe(false);
    },
  );

  it('lớp chưa có phòng → "Chưa chọn"', async () => {
    server.use(
      http.get('*/api/v1/classes/:id', () => HttpResponse.json({ data: cls({ defaultRoomId: null }) })),
      http.get('*/api/v1/classes/:id/students', () => page([])),
    );
    renderApp({ route: `/classes/${CLASS_ID}`, user: makeUser('TEACHER') });
    const label = await screen.findByText('Phòng', {}, { timeout: 5000 });
    expect(label.nextElementSibling).toHaveTextContent('Chưa chọn');
  });
});

describe('form tạo lớp', () => {

  beforeAll(() => {
    // Radix Select / popovers need these in jsdom.
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => undefined;
    Element.prototype.releasePointerCapture ??= () => undefined;
  });

  const openCreate = async (user: ReturnType<typeof userEvent.setup>) => {
    renderApp({ route: '/classes', user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Thêm lớp' }));
    return screen.findByRole('dialog', { name: 'Thêm lớp học' }, { timeout: 5000 });
  };

  const pick = async (
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    label: RegExp,
    option: string,
  ) => {
    await user.click(within(dialog).getByRole('combobox', { name: label }));
    await user.click(await screen.findByRole('option', { name: option }));
  };

  const pickDay = async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, label: RegExp, day: string) => {
    await user.click(within(dialog).getByRole('button', { name: label }));
    await user.click(await screen.findByRole('gridcell', { name: day }).then((c) => within(c).getByRole('button')));
  };

  const fill = async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => {
    await user.type(within(dialog).getByLabelText(/Mã lớp/), 'ielts-02');
    await user.type(within(dialog).getByLabelText(/Tên lớp/), 'IELTS 02');
    await user.type(within(dialog).getByLabelText(/Trình độ/), 'Foundation');
    await pick(user, dialog, /Khóa học/, 'IELTS - IELTS');
    await pick(user, dialog, /^Giáo viên/, 'Cô Lan');
    await pickDay(user, dialog, /Ngày khai giảng/, '10');
    await pickDay(user, dialog, /Ngày kết thúc/, '20');
  };

  it('bộ chọn phòng mặc định chỉ tải phòng ACTIVE', async () => {
    mockCatalog();
    let roomStatus: string | null = null;
    server.use(
      http.get('*/api/v1/classes', () => page([])),
      http.get('*/api/v1/rooms', ({ request }) => {
        roomStatus = new URL(request.url).searchParams.get('status');
        return page([]);
      }),
    );
    const user = userEvent.setup();
    await openCreate(user);
    await waitFor(() => expect(roomStatus).toBe('ACTIVE'));
  });

  it('thiếu mã lớp: báo "Vui lòng nhập mã lớp" ngay trên trường, không gọi POST', async () => {
    mockCatalog();
    let posted = false;
    server.use(
      http.get('*/api/v1/classes', () => page([])),
      http.post('*/api/v1/classes', () => {
        posted = true;
        return HttpResponse.json({ data: cls() }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await within(dialog).findByText('Vui lòng nhập mã lớp')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Mã lớp/)).toHaveAttribute('aria-invalid', 'true');
    expect(posted).toBe(false);
  });

  it('server trả CLASS_CODE_EXISTS: lỗi hiện dưới ô Mã lớp và dialog vẫn mở', async () => {
    mockCatalog();
    server.use(
      http.get('*/api/v1/classes', () => page([])),
      http.post('*/api/v1/classes', () =>
        HttpResponse.json({ error: { code: 'CLASS_CODE_EXISTS', message: 'x' } }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await fill(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await within(dialog).findByText('Mã lớp đã được dùng. Nhập mã lớp khác.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Thêm lớp học' })).toBeInTheDocument();
  });

  it('tạo thành công: gửi mã viết hoa, đóng dialog và dòng mới xuất hiện', async () => {
    mockCatalog();
    const rows: unknown[] = [];
    let body: Record<string, unknown> = {};
    server.use(
      http.get('*/api/v1/classes', () => page(rows)),
      http.post('*/api/v1/classes', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        const created = cls({ id: '65000000000000000000c002', code: 'IELTS-02', name: 'IELTS 02', currentSize: 0 });
        rows.push(created);
        return HttpResponse.json({ data: created }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const dialog = await openCreate(user);
    await fill(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('IELTS-02')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Thêm lớp học' })).not.toBeInTheDocument());
    expect(body.code).toBe('IELTS-02');
    expect(body.courseId).toBe(COURSE_ID);
  });
});

