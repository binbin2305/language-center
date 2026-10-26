import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../../test/render';
import { makeUser } from '../../../test/users';
import { mockViewport, resetViewport } from '../../../test/media';
import { NAV_ITEMS } from '../nav-config';
import { ALL_ROLES } from '@lc/shared';

afterEach(resetViewport);

const labelsFor = (role: (typeof ALL_ROLES)[number]) =>
  NAV_ITEMS.filter((i) => i.roles.includes(role)).map((i) => i.label);

describe('NAV_ITEMS theo DESIGN §3', () => {
  it('MANAGER thấy đủ mục, gồm Cài đặt và Tài khoản', () => {
    expect(labelsFor('MANAGER')).toEqual(
      expect.arrayContaining([
        'Tổng quan', 'Tuyển sinh', 'Học viên', 'Lớp học', 'Xếp lớp', 'Lịch học', 'Điểm danh',
        'Kết quả học tập', 'Học phí', 'Báo cáo', 'Khóa học', 'Phòng học', 'Tài khoản', 'Cài đặt',
      ]),
    );
  });
  it('ACADEMIC_STAFF không có Tài khoản, Cài đặt', () => {
    const l = labelsFor('ACADEMIC_STAFF');
    expect(l).toContain('Báo cáo');
    expect(l).not.toContain('Tài khoản');
    expect(l).not.toContain('Cài đặt');
  });
  it('TEACHER dùng nhãn riêng', () => {
    const l = labelsFor('TEACHER');
    expect(l).toEqual(
      expect.arrayContaining(['Hôm nay của tôi', 'Kiểm tra đầu vào', 'Học viên lớp tôi', 'Lớp của tôi', 'Lịch dạy', 'Điểm danh', 'Kết quả học tập']),
    );
    expect(l).not.toContain('Xếp lớp');
  });
  it('STUDENT dùng nhãn riêng', () => {
    expect(labelsFor('STUDENT')).toEqual(
      expect.arrayContaining(['Trang của tôi', 'Hồ sơ của tôi', 'Lớp của tôi', 'Lịch học', 'Chuyên cần của tôi', 'Kết quả của tôi', 'Học phí của tôi']),
    );
  });
  it('ADMIN chỉ có Tài khoản và Thông báo', () => {
    expect(labelsFor('ADMIN')).toEqual(['Tài khoản', 'Thông báo']);
  });
  it('mỗi vai trò có tối đa 4 mục mobile (mục thứ 5 là Thêm)', () => {
    for (const r of ALL_ROLES) {
      expect(NAV_ITEMS.filter((i) => i.mobile && i.roles.includes(r)).length).toBeLessThanOrEqual(4);
    }
  });
});

describe('AppShell responsive', () => {
  it('desktop: sidebar, không có bottom nav', async () => {
    mockViewport(1280);
    renderApp({ route: '/', user: makeUser('TEACHER') });
    expect(await screen.findByRole('navigation', { name: 'Menu chính' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menu dưới' })).not.toBeInTheDocument();
  });

  it('viewport 375 với GIÁO VIÊN: bottom nav thay sidebar', async () => {
    mockViewport(375);
    renderApp({ route: '/', user: makeUser('TEACHER') });
    const bottom = await screen.findByRole('navigation', { name: 'Menu dưới' });
    expect(within(bottom).getByRole('link', { name: 'Lịch dạy' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Menu chính' })).not.toBeInTheDocument();
  });

  it('viewport 375 với MANAGER: drawer mở bằng nút menu', async () => {
    mockViewport(375);
    const user = userEvent.setup();
    renderApp({ route: '/', user: makeUser('MANAGER') });
    expect(screen.queryByRole('navigation', { name: 'Menu dưới' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Mở menu' }));
    const nav = await screen.findByRole('navigation', { name: 'Menu chính' });
    expect(within(nav).getByRole('link', { name: 'Báo cáo' })).toBeInTheDocument();
  });
});

describe('nút Thêm trên bottom nav', () => {
  it.each([
    ['TEACHER', 'Lớp của tôi'],
    ['TEACHER', 'Học viên lớp tôi'],
    ['STUDENT', 'Hồ sơ của tôi'],
  ] as const)('%s vào được "%s" qua Thêm ở 375px', async (role, label) => {
    mockViewport(375);
    const user = userEvent.setup();
    renderApp({ route: '/', user: makeUser(role) });
    await user.click(await screen.findByRole('button', { name: 'Thêm' }));
    const nav = await screen.findByRole('navigation', { name: 'Menu chính' });
    expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
  });
});
