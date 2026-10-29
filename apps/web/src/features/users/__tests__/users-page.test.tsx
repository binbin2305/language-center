import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const userDto = (over: Record<string, unknown> = {}) => ({
  id: '65000000000000000000a001',
  email: 'gv@center.local',
  username: 'gv@center.local',
  fullName: 'Trần Giáo Viên',
  role: 'TEACHER',
  status: 'ACTIVE',
  mustChangePassword: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const page = (rows: unknown[]) => ({ data: rows, meta: { page: 1, limit: 20, total: rows.length } });

describe('trang tài khoản (FR-ADM)', () => {
  it('tạo GV → dialog "Mật khẩu tạm" hiển thị tempPassword và nút "Sao chép" gọi clipboard', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get('*/api/v1/users', () => HttpResponse.json(page([]))),
      http.post('*/api/v1/users', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { user: userDto(), tempPassword: 'Tmp-12345-xyz' } }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderApp({ route: '/settings/users', user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Thêm tài khoản' }));
    const form = await screen.findByRole('dialog');
    await user.type(within(form).getByLabelText(/^Họ tên/), 'Trần Giáo Viên');
    await user.type(within(form).getByLabelText(/^Email/), 'gv@center.local');
    await user.type(within(form).getByLabelText(/^Ngôn ngữ giảng dạy/), 'Tiếng Anh');
    await user.type(within(form).getByLabelText(/^Trình độ giảng dạy/), 'A1');
    await user.click(within(form).getByRole('button', { name: 'Tạo tài khoản' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mật khẩu tạm' });
    expect(within(dialog).getByText('Tmp-12345-xyz')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Sao chép' }));
    expect(write).toHaveBeenCalledWith('Tmp-12345-xyz');
    expect(body).toMatchObject({ role: 'TEACHER', teacherProfile: { languages: ['Tiếng Anh'], levels: ['A1'] } });
  });

  it('email không hợp lệ → lỗi dưới ô, không gọi POST', async () => {
    const posted = vi.fn();
    server.use(
      http.get('*/api/v1/users', () => HttpResponse.json(page([]))),
      http.post('*/api/v1/users', () => { posted(); return HttpResponse.json({}, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/users', user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Thêm tài khoản' }));
    const form = await screen.findByRole('dialog');
    await user.type(within(form).getByLabelText(/^Họ tên/), 'Trần Giáo Viên');
    await user.type(within(form).getByLabelText(/^Email/), 'khong-hop-le');
    await user.click(within(form).getByRole('button', { name: 'Tạo tài khoản' }));
    expect(await within(form).findByText(/Nhập email hợp lệ/)).toBeInTheDocument();
    expect(posted).not.toHaveBeenCalled();
  });

  it('nút Khóa → ConfirmDialog → POST /users/:id/lock', async () => {
    const locked = vi.fn();
    server.use(
      http.get('*/api/v1/users', () => HttpResponse.json(page([userDto()]))),
      http.post('*/api/v1/users/:id/lock', ({ params }) => {
        locked(params.id);
        return HttpResponse.json({ data: userDto({ status: 'LOCKED' }) });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/users', user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Khóa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Khóa tài khoản' });
    expect(locked).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Khóa tài khoản' }));
    await vi.waitFor(() => expect(locked).toHaveBeenCalledWith('65000000000000000000a001'));
  });

  it('tài khoản đang khóa có nút Mở khóa → POST unlock', async () => {
    const unlocked = vi.fn();
    server.use(
      http.get('*/api/v1/users', () => HttpResponse.json(page([userDto({ status: 'LOCKED' })]))),
      http.post('*/api/v1/users/:id/unlock', () => { unlocked(); return HttpResponse.json({ data: userDto() }); }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/users', user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Mở khóa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mở khóa tài khoản' });
    await user.click(within(dialog).getByRole('button', { name: 'Mở khóa' }));
    await vi.waitFor(() => expect(unlocked).toHaveBeenCalled());
  });

  it('đặt lại mật khẩu → hiện mật khẩu tạm mới', async () => {
    server.use(
      http.get('*/api/v1/users', () => HttpResponse.json(page([userDto()]))),
      http.post('*/api/v1/users/:id/reset-password', () => HttpResponse.json({ data: { tempPassword: 'Reset-999' } })),
    );
    const user = userEvent.setup();
    renderApp({ route: '/settings/users', user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Đặt lại mật khẩu' }));
    const confirm = await screen.findByRole('dialog', { name: 'Đặt lại mật khẩu' });
    await user.click(within(confirm).getByRole('button', { name: 'Đặt lại mật khẩu' }));
    expect(await screen.findByText('Reset-999')).toBeInTheDocument();
  });

  it('không có nút khóa cho chính mình', async () => {
    const me = makeUser('MANAGER');
    server.use(http.get('*/api/v1/users', () => HttpResponse.json(page([userDto({ id: me.id, role: 'MANAGER' })]))));
    renderApp({ route: '/settings/users', user: me });
    await screen.findByText('Trần Giáo Viên');
    expect(screen.queryByRole('button', { name: 'Khóa' })).not.toBeInTheDocument();
  });

  it('lỗi tải → trạng thái lỗi', async () => {
    server.use(http.get('*/api/v1/users', () => HttpResponse.json({}, { status: 500 })));
    renderApp({ route: '/settings/users', user: makeUser('MANAGER') });
    expect(await screen.findByText('Không tải được dữ liệu')).toBeInTheDocument();
  });
});
