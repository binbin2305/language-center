import { http, HttpResponse } from 'msw';
import { ALL_ROLES } from '@lc/shared';
import { screen } from '@testing-library/react';
import { APP_ROUTES } from '../router';
import { server } from '../../test/msw/server';
import { renderApp } from '../../test/render';
import { makeUser } from '../../test/users';

// The first render of a lazy route compiles its chunk; 1s (RTL default) is too tight under load.
const PAGE = { timeout: 5000 };
const SID = '650000000000000000000009';

const notFound = () =>
  HttpResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });

// Detail endpoints of the pages under test: a handled 404 keeps the output free of MSW errors.
beforeEach(() => {
  server.use(
    http.get('*/api/v1/students/me', notFound),
    http.get('*/api/v1/students/:id', notFound),
    http.get('*/api/v1/leads/:id', notFound),
    http.get('*/api/v1/classes/:id', notFound),
    http.get('*/api/v1/settings', notFound),
  );
});

const student = {
  id: SID,
  code: 'HV2026000001',
  fullName: 'Nguyễn Thị Lan',
  dob: '2005-03-14',
  gender: 'FEMALE',
  phone: '0912345678',
  email: null,
  address: null,
  status: 'ACTIVE',
  documents: [],
  note: null,
  createdAt: '2026-10-01T01:00:00.000Z',
  updatedAt: '2026-10-01T01:00:00.000Z',
  enrollments: [],
  summary: { attendanceRate: null, averageScore: null, outstandingBalance: 0 },
};

describe('route table', () => {
  it.each(APP_ROUTES.map((r) => [r.path, r.roles[0]] as const))(
    '%s render được cho vai trò đầu tiên được phép (%s)',
    async (path, role) => {
      const concrete = path.replace(':id', '650000000000000000000009');
      renderApp({ route: `/${concrete}`, user: makeUser(role) });
      expect(await screen.findByRole('heading', { level: 1 }, PAGE)).toBeInTheDocument();
      expect(screen.queryByText('Bạn không có quyền truy cập trang này')).not.toBeInTheDocument();
    },
  );

  it('tab Lịch sử thay đổi của /students/:id hiện được cho MANAGER', async () => {
    server.use(
      http.get(`*/api/v1/students/${SID}`, () => HttpResponse.json({ data: student })),
      http.get(`*/api/v1/students/${SID}/audit`, () =>
        HttpResponse.json({
          data: [
            {
              id: '650000000000000000000a01',
              at: '2026-10-20T01:00:00.000Z',
              action: 'update',
              actorId: '650000000000000000000001',
              actorRole: 'MANAGER',
              entity: 'students',
              entityId: SID,
              before: { fullName: 'Nguyen Thi Lan' },
              after: { fullName: 'Nguyễn Thị Lan' },
            },
          ],
          meta: { page: 1, limit: 20, total: 1 },
        }),
      ),
    );
    renderApp({ route: `/students/${SID}?tab=audit`, user: makeUser('MANAGER') });
    expect(await screen.findByRole('tab', { name: 'Lịch sử thay đổi', selected: true }, PAGE)).toBeInTheDocument();
    expect(await screen.findByText('Họ tên: Nguyen Thi Lan → Nguyễn Thị Lan', {}, PAGE)).toBeInTheDocument();
  });

  it('GIÁO VIÊN không có tab Học phí ở hồ sơ học viên', async () => {
    server.use(http.get(`*/api/v1/students/${SID}`, () => HttpResponse.json({ data: student })));
    renderApp({ route: `/students/${SID}`, user: makeUser('TEACHER') });
    await screen.findByRole('heading', { level: 1, name: 'Hồ sơ học viên' }, PAGE);
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
      expect(await screen.findByRole('heading', { level: 1 }, PAGE)).toBeInTheDocument();
      expect(screen.queryByText('Bạn không có quyền truy cập trang này')).not.toBeInTheDocument();
    } else {
      expect(await screen.findByText('Bạn không có quyền truy cập trang này', {}, PAGE)).toBeInTheDocument();
    }
  });
});
