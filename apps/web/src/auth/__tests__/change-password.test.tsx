import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/render';
import { makeUser } from '../../../test/users';

const forced = makeUser('TEACHER', { mustChangePassword: true });

describe('đổi mật khẩu', () => {
  it('mật khẩu mới yếu hiện lỗi, không gọi API', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/change-password', user: forced });
    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'Old12345');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'abc');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByText(/ít nhất 8 ký tự/)).toBeInTheDocument();
  });

  it('nhập lại không khớp hiện lỗi', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/change-password', user: forced });
    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'Old12345');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'Newpass12');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'Newpass13');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByText('Mật khẩu nhập lại không khớp')).toBeInTheDocument();
  });

  it('mật khẩu hiện tại sai hiện lỗi ở ô hiện tại', async () => {
    server.use(
      http.post('*/api/v1/auth/change-password', () =>
        HttpResponse.json(
          { error: { code: 'INVALID_CREDENTIALS', message: 'bad' } },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp({ route: '/change-password', user: forced });
    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'Wrong1234');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'Newpass12');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'Newpass12');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByText('Mật khẩu hiện tại không đúng')).toBeInTheDocument();
  });

  it('thành công: cập nhật phiên và vào trang chủ', async () => {
    server.use(
      http.post('*/api/v1/auth/change-password', () =>
        HttpResponse.json({
          data: { accessToken: 'new', user: { ...forced, mustChangePassword: false } },
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp({ route: '/change-password', user: forced });
    await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'Old12345');
    await user.type(screen.getByLabelText('Mật khẩu mới'), 'Newpass12');
    await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'Newpass12');
    await user.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(await screen.findByRole('heading', { name: 'Hôm nay của tôi' })).toBeInTheDocument();
  });
});

describe('thoát khỏi đổi mật khẩu bắt buộc', () => {
  it('có nút Đăng xuất đưa về /login', async () => {
    server.use(http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })));
    const user = userEvent.setup();
    renderApp({ route: '/change-password', user: forced });
    await user.click(await screen.findByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByLabelText('Email hoặc mã học viên')).toBeInTheDocument();
  });
});
