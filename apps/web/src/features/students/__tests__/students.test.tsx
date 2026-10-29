import { http, HttpResponse } from 'msw';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Role } from '@lc/shared';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const SID = '65000000000000000000b001';
const DOC_ID = '65000000000000000000d001';
const student = (over: Record<string, unknown> = {}) => ({
  id: SID,
  code: 'HV2026000001',
  fullName: 'Nguyễn Thị Lan',
  dob: '2005-03-14',
  gender: 'FEMALE',
  phone: '0912345678',
  email: 'lan@example.com',
  address: '12 Lê Lợi',
  status: 'ACTIVE',
  documents: [
    {
      id: DOC_ID,
      fileName: 'cccd.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      uploadedAt: '2026-10-20T01:00:00.000Z',
      uploadedBy: '650000000000000000000001',
    },
  ],
  note: null,
  createdAt: '2026-10-01T01:00:00.000Z',
  updatedAt: '2026-10-01T01:00:00.000Z',
  enrollments: [],
  summary: { attendanceRate: null, averageScore: null, outstandingBalance: 0 },
  ...over,
});
const page = (data: unknown[]) => ({ data, meta: { page: 1, limit: 20, total: data.length } });
const brief = {
  id: SID,
  code: 'HV2026000001',
  fullName: 'Nguyễn Thị Lan',
  dob: '2005-03-14',
  phone: '0912345678',
  status: 'ACTIVE',
};

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

describe('danh sách học viên (FR-ADM-05)', () => {
  it('gõ "ngu" nhanh → chỉ 1 request GET /students?q=ngu sau 300ms', async () => {
    const queries: Array<string | null> = [];
    server.use(
      http.get('*/api/v1/students', ({ request }) => {
        queries.push(new URL(request.url).searchParams.get('q'));
        return HttpResponse.json(page([student()]));
      }),
      http.get('*/api/v1/courses', () => HttpResponse.json(page([]))),
    );
    renderApp({ user: makeUser(Role.ACADEMIC_STAFF), route: '/students' });
    expect(await screen.findByText('HV2026000001')).toBeInTheDocument();
    expect(queries).toEqual([null]);

    const box = screen.getByRole('searchbox');
    vi.useFakeTimers();
    try {
      for (const v of ['n', 'ng', 'ngu']) fireEvent.change(box, { target: { value: v } });
      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(queries).toEqual([null]);
      act(() => {
        vi.advanceTimersByTime(1);
      });
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(queries).toEqual([null, 'ngu']));
  });

  it('GV thấy danh sách rút gọn và không có nút Sửa ở hồ sơ', async () => {
    server.use(
      http.get('*/api/v1/students', () => HttpResponse.json(page([brief]))),
      http.get('*/api/v1/courses', () => HttpResponse.json(page([]))),
    );
    renderApp({ user: makeUser(Role.TEACHER), route: '/students' });
    expect(await screen.findByRole('link', { name: 'Nguyễn Thị Lan' })).toHaveAttribute(
      'href',
      `/students/${SID}`,
    );
  });
});

describe('hồ sơ học viên (FR-ADM-05/06)', () => {
  const mockDetail = (body: unknown = student()) =>
    server.use(http.get(`*/api/v1/students/${SID}`, () => HttpResponse.json({ data: body })));

  it('TEACHER ở /students/:id không thấy tab "Học phí", "Giấy tờ", "Lịch sử thay đổi"; thông tin rút gọn', async () => {
    mockDetail({ ...brief, enrollments: [] });
    renderApp({ user: makeUser(Role.TEACHER), route: `/students/${SID}` });
    // First load of the lazy teacher tabs can exceed the default 1s.
    expect(await screen.findByText('0912345678', {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Thông tin' })).toBeInTheDocument();
    for (const name of ['Học phí', 'Giấy tờ', 'Lịch sử thay đổi'])
      expect(screen.queryByRole('tab', { name })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument();
    expect(screen.queryByText('Email')).not.toBeInTheDocument();
    expect(screen.queryByText('Địa chỉ')).not.toBeInTheDocument();
  });

  it('sửa họ tên rồi bấm Hủy → ConfirmDialog "Bỏ thay đổi?"', async () => {
    mockDetail();
    renderApp({ user: makeUser(Role.ACADEMIC_STAFF), route: `/students/${SID}` });
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa hồ sơ học viên' });
    const name = within(dialog).getByLabelText(/Họ và tên/);
    await userEvent.clear(name);
    await userEvent.type(name, 'Lan Nguyễn');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }));
    expect(await screen.findByText('Bỏ thay đổi?')).toBeInTheDocument();
  });

  it('PATCH trả warnings.duplicates → toast cảnh báo "Số điện thoại trùng với HV…"', async () => {
    mockDetail();
    server.use(
      http.patch(`*/api/v1/students/${SID}`, () =>
        HttpResponse.json({
          data: {
            student: student({ phone: '0987654321' }),
            warnings: {
              duplicates: [
                {
                  kind: 'STUDENT',
                  id: '65000000000000000000b002',
                  fullName: 'Trần Văn Nam',
                  phone: '0987654321',
                  email: null,
                  code: 'HV2026000002',
                  status: 'ACTIVE',
                  matchedOn: ['phone'],
                },
              ],
            },
          },
        }),
      ),
    );
    renderApp({ user: makeUser(Role.ACADEMIC_STAFF), route: `/students/${SID}` });
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa hồ sơ học viên' });
    const phone = within(dialog).getByLabelText(/Số điện thoại/);
    await userEvent.clear(phone);
    await userEvent.type(phone, '0987654321');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText(/Số điện thoại trùng với HV Trần Văn Nam \(HV2026000002\)/)).toBeInTheDocument();
  });

  it('tab Giấy tờ: upload file > 5MB → lỗi ngay ở client, không gọi API', async () => {
    mockDetail();
    const posts: string[] = [];
    server.use(
      http.post(`*/api/v1/students/${SID}/documents`, ({ request }) => {
        posts.push(request.method);
        return HttpResponse.json({ data: student().documents[0] }, { status: 201 });
      }),
    );
    renderApp({ user: makeUser(Role.ACADEMIC_STAFF), route: `/students/${SID}?tab=documents` });
    expect(await screen.findByText('cccd.pdf')).toBeInTheDocument();
    const input = screen.getByLabelText('Tải giấy tờ lên');
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' });
    await userEvent.upload(input, big);
    expect(await screen.findByText(/Tệp quá lớn/)).toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  it('tab Giấy tờ: upload file hợp lệ → POST /students/:id/documents', async () => {
    mockDetail();
    const posts: string[] = [];
    server.use(
      http.post(`*/api/v1/students/${SID}/documents`, ({ request }) => {
        posts.push(`${request.method} ${new URL(request.url).pathname}`);
        return HttpResponse.json({ data: student().documents[0] }, { status: 201 });
      }),
    );
    renderApp({ user: makeUser(Role.ACADEMIC_STAFF), route: `/students/${SID}?tab=documents` });
    expect(await screen.findByText('cccd.pdf')).toBeInTheDocument();
    await userEvent.upload(
      screen.getByLabelText('Tải giấy tờ lên'),
      new File(['x'], 'hoso.pdf', { type: 'application/pdf' }),
    );
    await waitFor(() => expect(posts).toEqual([`POST /api/v1/students/${SID}/documents`]));
  });

  it('tab Lịch sử thay đổi liệt kê các lần sửa', async () => {
    mockDetail();
    server.use(
      http.get(`*/api/v1/students/${SID}/audit`, () =>
        HttpResponse.json(
          page([
            {
              id: '65000000000000000000e001',
              actorId: '650000000000000000000001',
              actorRole: 'ACADEMIC_STAFF',
              action: 'update',
              entity: 'student',
              entityId: SID,
              before: { phone: '0911111111' },
              after: { phone: '0912345678' },
              at: '2026-10-20T01:00:00.000Z',
            },
          ]),
        ),
      ),
    );
    renderApp({ user: makeUser(Role.MANAGER), route: `/students/${SID}?tab=audit` });
    expect(await screen.findByText('Cập nhật')).toBeInTheDocument();
    expect(screen.getByText(/0911111111/)).toBeInTheDocument();
  });
});

describe('hồ sơ của tôi (FR-ADM-07)', () => {
  it('HV /me/profile chỉ có ô SĐT, Email, Địa chỉ có thể sửa; lưu → PATCH /students/me/contact', async () => {
    server.use(http.get('*/api/v1/students/me', () => HttpResponse.json({ data: student() })));
    let body: unknown;
    server.use(
      http.patch('*/api/v1/students/me/contact', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { student: student({ phone: '0987654321' }) } });
      }),
    );
    renderApp({ user: makeUser(Role.STUDENT), route: '/me/profile' });
    const phone = await screen.findByLabelText(/Số điện thoại/);
    const editable = screen.getAllByRole('textbox').map((e) => e.getAttribute('id'));
    expect(editable).toHaveLength(3);
    expect(screen.getByLabelText(/Email/)).toBeEnabled();
    expect(screen.getByLabelText(/Địa chỉ/)).toBeEnabled();
    expect(screen.getByText('Nguyễn Thị Lan')).toBeInTheDocument();
    expect(screen.getByText('HV2026000001')).toBeInTheDocument();
    await userEvent.clear(phone);
    await userEvent.type(phone, '0987654321');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(body).toMatchObject({ phone: '0987654321' }));
    expect(Object.keys(body as object).sort()).toEqual(['address', 'email', 'phone']);
    expect(await screen.findByText('Đã cập nhật thông tin liên hệ')).toBeInTheDocument();
  });
});
