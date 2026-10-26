import { ALL_ROLES } from '@lc/shared';
import { screen } from '@testing-library/react';
import { APP_ROUTES } from '../router';
import { renderApp } from '../../test/render';
import { makeUser } from '../../test/users';

describe('route table', () => {
  it.each(APP_ROUTES.map((r) => [r.path, r.roles[0]] as const))(
    '%s render được cho vai trò đầu tiên được phép (%s)',
    async (path, role) => {
      const concrete = path.replace(':id', '650000000000000000000009');
      renderApp({ route: `/${concrete}`, user: makeUser(role) });
      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.queryByText('Bạn không có quyền truy cập trang này')).not.toBeInTheDocument();
    },
  );

  it('tab Lịch sử thay đổi của /students/:id hiện được cho MANAGER', async () => {
    renderApp({ route: '/students/650000000000000000000009?tab=audit', user: makeUser('MANAGER') });
    expect(await screen.findByRole('heading', { level: 2, name: 'Lịch sử thay đổi' })).toBeInTheDocument();
  });

  it('GIÁO VIÊN không có tab Học phí ở hồ sơ học viên', async () => {
    renderApp({ route: '/students/650000000000000000000009', user: makeUser('TEACHER') });
    await screen.findByRole('heading', { level: 1, name: 'Hồ sơ học viên' });
    expect(screen.queryByRole('tab', { name: 'Học phí' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Chuyên cần' })).toBeInTheDocument();
  });
});

describe('phân quyền route: APP_ROUTES x mọi vai trò', () => {
  const cases = APP_ROUTES.flatMap((r) =>
    ALL_ROLES.map((role) => [r.path, role, r.roles.includes(role)] as const),
  );
  it.each(cases)('/%s với %s -> cho phép=%s', async (path, role, allowed) => {
    renderApp({ route: `/${path.replace(':id', '650000000000000000000009')}`, user: makeUser(role) });
    if (allowed) {
      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.queryByText('Bạn không có quyền truy cập trang này')).not.toBeInTheDocument();
    } else {
      expect(await screen.findByText('Bạn không có quyền truy cập trang này')).toBeInTheDocument();
    }
  });
});
