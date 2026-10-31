import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const ENR = '65000000000000000000a001';
const STU = '65000000000000000000b001';
const COURSE = '65000000000000000000d001';
const CLS_B1 = '65000000000000000000c001';
const CLS_B2 = '65000000000000000000c002';
const T = { timeout: 10_000 };

const enrollment = (over: Record<string, unknown> = {}) => ({
  id: ENR,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  studentId: STU,
  courseId: COURSE,
  classId: null,
  status: 'WAITING_CLASS',
  placementLevel: 'B1',
  placementSkipped: null,
  levelOverride: null,
  waitingSince: '2026-01-01T00:00:00.000Z',
  enrolledAt: null,
  confirmedAt: null,
  transferredToId: null,
  transferredFromId: null,
  invoiceId: null,
  history: [],
  studentName: 'Nguyễn Văn An',
  studentCode: 'HV2026001',
  courseName: 'IELTS',
  className: undefined,
  ...over,
});
const waiting = (days: number, over: Record<string, unknown> = {}) => ({ ...enrollment(over), waitingDays: days });
const cls = (id: string, level: string, over: Record<string, unknown> = {}) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  code: `L-${level}`,
  name: `Lớp ${level}`,
  courseId: COURSE,
  courseName: 'IELTS',
  level,
  teacherId: '65000000000000000000e001',
  teacherName: 'Cô Lan',
  defaultRoomId: null,
  maxCapacity: 20,
  currentSize: 10,
  startDate: '2026-02-01',
  endDate: '2026-05-01',
  status: 'PLANNED',
  ...over,
});
const page = (data: unknown[]) => HttpResponse.json({ data, meta: { page: 1, limit: 20, total: data.length } });

describe('danh sách chờ xếp lớp', () => {
  const setup = (rows = [waiting(3)]) => {
    server.use(
      http.get('*/api/v1/enrollments/waiting', () => page(rows)),
      http.get('*/api/v1/classes', () => page([cls(CLS_B2, 'B2'), cls(CLS_B1, 'B1')])),
    );
  };
  const openPanel = async () => {
    const user = userEvent.setup();
    renderApp({ route: '/enrollments/waiting', user: makeUser('ACADEMIC_STAFF') });
    await user.click(await screen.findByRole('button', { name: 'Xếp lớp cho Nguyễn Văn An' }, T));
    return user;
  };

  it('HV chờ 15 ngày → dòng cam (data-overdue), 14 ngày → không', async () => {
    setup([waiting(15), waiting(14, { id: '65000000000000000000a002', studentName: 'Trần Thị Bình' })]);
    renderApp({ route: '/enrollments/waiting', user: makeUser('MANAGER') });
    const late = await screen.findByText('15 ngày', {}, T);
    expect(late).toHaveAttribute('data-overdue', 'true');
    expect(screen.getByText('14 ngày')).toHaveAttribute('data-overdue', 'false');
  });

  it('panel: lớp cùng level B1 ở nhóm "Phù hợp" trước, lớp B2 ở nhóm "Khác"', async () => {
    setup();
    await openPanel();
    const fit = await screen.findByRole('group', { name: 'Phù hợp' }, T);
    const other = screen.getByRole('group', { name: 'Khác' });
    expect(within(fit).getByLabelText(/Lớp B1/)).toBeInTheDocument();
    expect(within(other).getByLabelText(/Lớp B2/)).toBeInTheDocument();
    expect(fit.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lớp nhóm "Khác" bắt buộc lý do ≥5 ký tự, POST assign kèm overrideReason', async () => {
    setup();
    let body: unknown;
    server.use(
      http.post('*/api/v1/enrollments/:id/assign', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: enrollment({ status: 'ENROLLED', classId: CLS_B2 }) });
      }),
    );
    const user = await openPanel();
    await user.click(await screen.findByLabelText(/Lớp B2/, {}, T));
    const submit = screen.getByRole('button', { name: 'Xếp vào lớp' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Lý do xếp lớp khác trình độ'), 'abc');
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Lý do xếp lớp khác trình độ'), 'def');
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(body).toEqual({ classId: CLS_B2, overrideReason: 'abcdef' }));
  });

  it('lớp "Phù hợp" xếp ngay, không gửi overrideReason', async () => {
    setup();
    let body: unknown;
    server.use(
      http.post('*/api/v1/enrollments/:id/assign', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: enrollment({ status: 'ENROLLED' }) });
      }),
    );
    const user = await openPanel();
    await user.click(await screen.findByLabelText(/Lớp B1/, {}, T));
    await user.click(screen.getByRole('button', { name: 'Xếp vào lớp' }));
    await waitFor(() => expect(body).toEqual({ classId: CLS_B1 }));
  });

  it('422 CLASS_FULL → toast "Lớp vừa đầy" và GET /classes được gọi lại', async () => {
    let classCalls = 0;
    server.use(
      http.get('*/api/v1/enrollments/waiting', () => page([waiting(3)])),
      http.get('*/api/v1/classes', () => {
        classCalls += 1;
        return page([cls(CLS_B1, 'B1')]);
      }),
      http.post('*/api/v1/enrollments/:id/assign', () =>
        HttpResponse.json({ error: { code: 'CLASS_FULL', message: 'full' } }, { status: 422 }),
      ),
    );
    const user = await openPanel();
    await user.click(await screen.findByLabelText(/Lớp B1/, {}, T));
    const before = classCalls;
    await user.click(screen.getByRole('button', { name: 'Xếp vào lớp' }));
    expect(await screen.findByText(/Lớp vừa đầy/)).toBeInTheDocument();
    await waitFor(() => expect(classCalls).toBeGreaterThan(before));
  });
});

describe('tab Khóa học & lớp của học viên', () => {
  const setup = () =>
    server.use(
      http.get('*/api/v1/students/:id', () =>
        HttpResponse.json({ data: { id: STU, code: 'HV2026001', fullName: 'Nguyễn Văn An', status: 'ACTIVE' } }),
      ),
      http.get('*/api/v1/enrollments', () =>
        page([enrollment({ status: 'ENROLLED', classId: CLS_B1, className: 'Lớp B1' })]),
      ),
      http.get('*/api/v1/classes', () => page([cls(CLS_B2, 'B2')])),
    );

  it('ENROLLED có nút Chuyển lớp/Bảo lưu/Rút; Rút → lý do bắt buộc → POST withdraw CANCELLED', async () => {
    setup();
    let body: unknown;
    server.use(
      http.post('*/api/v1/enrollments/:id/withdraw', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: enrollment({ status: 'CANCELLED' }) });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: `/students/${STU}?tab=enrollments`, user: makeUser('ACADEMIC_STAFF') });
    expect(await screen.findByRole('button', { name: 'Chuyển lớp' }, T)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bảo lưu' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rút' }));
    const dlg = await screen.findByRole('dialog');
    const submit = within(dlg).getByRole('button', { name: 'Xác nhận rút' });
    expect(submit).toBeDisabled();
    await user.type(within(dlg).getByLabelText('Lý do'), 'Chuyển nhà');
    await user.click(submit);
    await waitFor(() => expect(body).toEqual({ status: 'CANCELLED', reason: 'Chuyển nhà' }));
  });

  it('Chuyển lớp: chọn lớp đích + lý do → POST transfer', async () => {
    setup();
    let body: unknown;
    server.use(
      http.post('*/api/v1/enrollments/:id/transfer', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: enrollment({ status: 'ENROLLED', classId: CLS_B2 }) });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: `/students/${STU}?tab=enrollments`, user: makeUser('ACADEMIC_STAFF') });
    await user.click(await screen.findByRole('button', { name: 'Chuyển lớp' }, T));
    const dlg = await screen.findByRole('dialog');
    await user.click(await within(dlg).findByLabelText(/Lớp B2/));
    await user.type(within(dlg).getByLabelText('Lý do'), 'Đổi lịch học');
    await user.click(within(dlg).getByRole('button', { name: 'Chuyển lớp' }));
    await waitFor(() => expect(body).toEqual({ toClassId: CLS_B2, reason: 'Đổi lịch học' }));
  });
});

describe('lớp của tôi', () => {
  it('ENROLLED chưa confirm → banner "Xác nhận lớp" → POST confirm → banner biến mất', async () => {
    let confirmed = false;
    server.use(
      http.get('*/api/v1/enrollments/me', () =>
        HttpResponse.json({
          data: [
            enrollment({
              status: 'ENROLLED',
              classId: CLS_B1,
              className: 'Lớp B1',
              confirmedAt: confirmed ? '2026-01-02T00:00:00.000Z' : null,
            }),
          ],
        }),
      ),
      http.post('*/api/v1/enrollments/:id/confirm', () => {
        confirmed = true;
        return HttpResponse.json({ data: enrollment({ status: 'ENROLLED', confirmedAt: '2026-01-02T00:00:00.000Z' }) });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/me/classes', user: makeUser('STUDENT') });
    await user.click(await screen.findByRole('button', { name: 'Xác nhận lớp' }, T));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Xác nhận lớp' })).not.toBeInTheDocument());
    expect(screen.getByText('Lớp B1')).toBeInTheDocument();
  });
});
