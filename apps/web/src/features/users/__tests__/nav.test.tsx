import { screen } from '@testing-library/react';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

describe('menu quản trị theo vai trò', () => {
  it('ACADEMIC_STAFF không thấy menu "Tài khoản" và "Cài đặt"', async () => {
    renderApp({ route: '/', user: makeUser('ACADEMIC_STAFF') });
    const nav = await screen.findByRole('navigation', { name: 'Menu chính' });
    expect(nav).toHaveTextContent('Khóa học');
    expect(nav).not.toHaveTextContent('Tài khoản');
    expect(nav).not.toHaveTextContent('Cài đặt');
  });

  it('MANAGER thấy cả hai', async () => {
    renderApp({ route: '/', user: makeUser('MANAGER') });
    const nav = await screen.findByRole('navigation', { name: 'Menu chính' });
    expect(nav).toHaveTextContent('Tài khoản');
    expect(nav).toHaveTextContent('Cài đặt');
  });
});
