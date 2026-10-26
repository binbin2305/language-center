import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MeDto } from '@lc/shared';
import { server } from '../../../test/msw/server';
import { renderApp } from '../../../test/render';
import { makeUser } from '../../../test/users';
import { resetViewport } from '../../../test/media';
import { tokenStore } from '@/lib/api';

const unauthenticated = () =>
  http.post('*/api/v1/auth/refresh', () =>
    HttpResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'no session' } },
      { status: 401 },
    ),
  );
const session = (user: MeDto) =>
  http.post('*/api/v1/auth/refresh', () =>
    HttpResponse.json({ data: { accessToken: 'tok', user } }),
  );

beforeEach(() => {
  resetViewport();
  tokenStore.clear();
});

describe('đăng nhập', () => {
  it('sai thông tin hiện "Sai thông tin đăng nhập"', async () => {
    server.use(
      unauthenticated(),
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json(
          { error: { code: 'INVALID_CREDENTIALS', message: 'bad' } },
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp({ route: '/' });
    await user.type(await screen.findByLabelText('Email hoặc mã học viên'), 'a@b.vn');
    await user.type(screen.getByLabelText('Mật khẩu'), 'wrongpass1');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Sai thông tin đăng nhập')).toBeInTheDocument();
  });

  it('nút hiện/ẩn mật khẩu đổi kiểu ô nhập', async () => {
    server.use(unauthenticated());
    const user = userEvent.setup();
    renderApp({ route: '/login' });
    const pw = await screen.findByLabelText('Mật khẩu');
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(pw).toHaveAttribute('type', 'text');
  });

  it('GIÁO VIÊN đăng nhập: sidebar có Lịch dạy, Điểm danh; không có Báo cáo, Xếp lớp', async () => {
    const teacher = makeUser('TEACHER');
    server.use(
      unauthenticated(),
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ data: { accessToken: 'tok', user: teacher } }),
      ),
    );
    const user = userEvent.setup();
    renderApp({ route: '/login' });
    await user.type(await screen.findByLabelText('Email hoặc mã học viên'), 'gv@center.local');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Passw0rdx');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    const nav = await screen.findByRole('navigation', { name: 'Menu chính' });
    expect(within(nav).getByRole('link', { name: 'Lịch dạy' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Điểm danh' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Báo cáo' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Xếp lớp' })).not.toBeInTheDocument();
  });

  it('chưa đăng nhập vào /classes chuyển về /login rồi quay lại /classes sau khi đăng nhập', async () => {
    server.use(
      unauthenticated(),
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({ data: { accessToken: 'tok', user: makeUser('MANAGER') } }),
      ),
    );
    const user = userEvent.setup();
    renderApp({ route: '/classes' });
    await user.type(await screen.findByLabelText('Email hoặc mã học viên'), 'm@center.local');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Passw0rdx');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('heading', { name: 'Lớp học' })).toBeInTheDocument();
  });

  it('mustChangePassword sau đăng nhập chuyển sang /change-password', async () => {
    server.use(
      unauthenticated(),
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json({
          data: { accessToken: 'tok', user: makeUser('STUDENT', { mustChangePassword: true }) },
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp({ route: '/login' });
    await user.type(await screen.findByLabelText('Email hoặc mã học viên'), 'HV1');
    await user.type(screen.getByLabelText('Mật khẩu'), 'Passw0rdx');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('heading', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
  });
});

describe('khởi động phiên', () => {
  it('có cookie hợp lệ: vào thẳng trang chủ', async () => {
    server.use(session(makeUser('MANAGER')));
    renderApp({ route: '/' });
    expect(await screen.findByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument();
  });
});

describe('bảo vệ route', () => {
  it('user mustChangePassword vào /classes bị chuyển sang /change-password', async () => {
    server.use(session(makeUser('MANAGER', { mustChangePassword: true })));
    renderApp({ route: '/classes' });
    expect(await screen.findByRole('heading', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menu chính' })).not.toBeInTheDocument();
  });

  it('HỌC VIÊN vào /reports thấy trang 403', async () => {
    renderApp({ route: '/reports', user: makeUser('STUDENT') });
    expect(await screen.findByText('Bạn không có quyền truy cập trang này')).toBeInTheDocument();
  });

  it('route không tồn tại hiện 404', async () => {
    renderApp({ route: '/khong-co', user: makeUser('MANAGER') });
    expect(await screen.findByText('Không tìm thấy trang')).toBeInTheDocument();
  });

  it('/ với HỌC VIÊN render StudentHome', async () => {
    renderApp({ route: '/', user: makeUser('STUDENT') });
    expect(await screen.findByRole('heading', { name: 'Trang của tôi' })).toBeInTheDocument();
  });

  it('/ với GIÁO VIÊN render TeacherHome', async () => {
    renderApp({ route: '/', user: makeUser('TEACHER') });
    expect(await screen.findByRole('heading', { name: 'Hôm nay của tôi' })).toBeInTheDocument();
  });

  it('/ với MANAGER render StaffDashboard', async () => {
    renderApp({ route: '/', user: makeUser('MANAGER') });
    expect(await screen.findByRole('heading', { name: 'Tổng quan' })).toBeInTheDocument();
  });

  it('/ với ADMIN chuyển sang Tài khoản', async () => {
    renderApp({ route: '/', user: makeUser('ADMIN') });
    expect(await screen.findByRole('heading', { name: 'Tài khoản' })).toBeInTheDocument();
  });

  it('đăng xuất đưa về /login', async () => {
    server.use(http.post('*/api/v1/auth/logout', () => new HttpResponse(null, { status: 204 })));
    const user = userEvent.setup();
    renderApp({ route: '/', user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Tài khoản của tôi' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Đăng xuất' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument(),
    );
  });
});
