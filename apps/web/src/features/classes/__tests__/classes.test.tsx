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
