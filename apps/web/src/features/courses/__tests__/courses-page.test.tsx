import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const course = (over: Record<string, unknown> = {}) => ({
  id: '65000000000000000000c001',
  code: 'TOEIC-1',
  name: 'TOEIC cơ bản',
  language: 'Tiếng Anh',
  levels: ['A1'],
  description: null,
  totalSessions: 24,
  baseFee: 4500000,
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const page = (rows: unknown[]) => ({ data: rows, meta: { page: 1, limit: 20, total: rows.length } });

async function fillCourseForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Thêm khóa học' }));
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText(/^Mã/), 'ielts-a');
  await user.type(within(dialog).getByLabelText(/^Tên khóa học/), 'IELTS A');
  await user.type(within(dialog).getByLabelText(/^Ngôn ngữ/), 'Tiếng Anh');
  await user.type(within(dialog).getByLabelText(/^Trình độ/), 'A1, A2');
  await user.type(within(dialog).getByLabelText(/^Tổng số buổi/), '30');
  await user.type(within(dialog).getByLabelText(/^Học phí/), '5000000');
  return dialog;
}

describe('trang khóa học (FR-CAT-01)', () => {
  it('tạo khóa thành công → hàng "IELTS-A" xuất hiện trong bảng', async () => {
    const rows: unknown[] = [];
    let body: Record<string, unknown> = {};
    server.use(
      http.get('*/api/v1/courses', () => HttpResponse.json(page(rows))),
      http.post('*/api/v1/courses', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        const created = course({ id: '65000000000000000000c002', code: 'IELTS-A', name: 'IELTS A' });
        rows.push(created);
        return HttpResponse.json({ data: created }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/courses', user: makeUser('ACADEMIC_STAFF') });
    expect(await screen.findByText('Chưa có khóa học nào')).toBeInTheDocument();
    const dialog = await fillCourseForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByRole('cell', { name: 'IELTS-A' })).toBeInTheDocument();
    expect(body).toMatchObject({ code: 'IELTS-A', levels: ['A1', 'A2'], totalSessions: 30, baseFee: 5000000 });
  });

  it('409 → "Mã khóa học đã tồn tại" hiển thị dưới ô Mã', async () => {
    server.use(
      http.get('*/api/v1/courses', () => HttpResponse.json(page([]))),
      http.post('*/api/v1/courses', () =>
        HttpResponse.json(
          { error: { code: 'CONFLICT', message: 'x', details: { fields: { code: 'DUPLICATE' } } } },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/courses', user: makeUser('MANAGER') });
    const dialog = await fillCourseForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    const field = within(dialog).getByLabelText(/^Mã/);
    expect(await within(dialog).findByText('Mã khóa học đã tồn tại')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });

  it('thiếu tên → lỗi dưới ô, không gọi POST', async () => {
    const posted = vi.fn();
    server.use(
      http.get('*/api/v1/courses', () => HttpResponse.json(page([]))),
      http.post('*/api/v1/courses', () => { posted(); return HttpResponse.json({}, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/courses', user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Thêm khóa học' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await within(dialog).findByText('Nhập tên khóa học.')).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it('lỗi tải → hiện trạng thái lỗi; có dữ liệu → hiển thị học phí', async () => {
    server.use(http.get('*/api/v1/courses', () => HttpResponse.json({}, { status: 500 })));
    renderApp({ route: '/settings/courses', user: makeUser('MANAGER') });
    expect(await screen.findByText('Không tải được dữ liệu')).toBeInTheDocument();
  });

  it('hiển thị học phí dạng tiền và sửa khóa không cho đổi mã', async () => {
    server.use(http.get('*/api/v1/courses', () => HttpResponse.json(page([course()]))));
    const user = userEvent.setup();
    renderApp({ route: '/settings/courses', user: makeUser('MANAGER') });
    expect(await screen.findByText(/4\.500\.000/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sửa khóa học TOEIC-1' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText(/^Mã/)).toHaveValue('TOEIC-1'));
    expect(within(dialog).getByLabelText(/^Mã/)).toBeDisabled();
  });
});
