import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const LEAD_ID = '65000000000000000000a001';
const COURSE_ID = '65000000000000000000c001';
const STUDENT_ID = '65000000000000000000b001';
const course = { id: COURSE_ID, code: 'IELTS', name: 'IELTS Foundation', status: 'ACTIVE' };
const lead = (over: Record<string, unknown> = {}) => ({
  id: LEAD_ID,
  fullName: 'Nguyễn Thị Lan',
  dob: '2005-03-14',
  gender: 'FEMALE',
  phone: '0912345678',
  email: 'lan@example.com',
  address: null,
  interestedCourseId: COURSE_ID,
  note: null,
  status: 'NEW',
  studentId: null,
  createdAt: '2026-10-20T01:00:00.000Z',
  updatedAt: '2026-10-20T01:00:00.000Z',
  ...over,
});
const page = (data: unknown[]) => ({ data, meta: { page: 1, limit: 20, total: data.length } });
const duplicate = {
  kind: 'STUDENT',
  id: STUDENT_ID,
  fullName: 'Nguyễn Thị Lan',
  phone: '0912345678',
  email: null,
  code: 'HV2026000001',
  status: 'ACTIVE',
  matchedOn: ['phone'],
};
const dupError = () =>
  HttpResponse.json(
    {
      error: {
        code: 'DUPLICATE_PERSON',
        message: 'Trùng',
        details: { duplicates: [duplicate] },
      },
    },
    { status: 409 },
  );

const mockCourses = () =>
  server.use(http.get('*/api/v1/courses', () => HttpResponse.json(page([course]))));

// Radix Select / jsdom gaps.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

describe('danh sách lead (FR-ADM-01)', () => {
  it('lọc trạng thái gửi ?status=NEW', async () => {
    mockCourses();
    const seen: Array<string | null> = [];
    server.use(
      http.get('*/api/v1/leads', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('status'));
        return HttpResponse.json(page([lead()]));
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: '/admissions/leads', user: makeUser('ACADEMIC_STAFF') });
    // first lazy page import compiles the table/select/calendar chunks
    expect(await screen.findByText('Nguyễn Thị Lan', undefined, { timeout: 5000 })).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Trạng thái' }));
    await user.click(await screen.findByRole('option', { name: 'Mới' }));
    await waitFor(() => expect(seen).toContain('NEW'));
  });

  it('cột "Người tiếp nhận" hiện createdByName (L-ADMISSIONS-1)', async () => {
    mockCourses();
    server.use(http.get('*/api/v1/leads', () => HttpResponse.json(page([lead({ createdByName: 'Lê Tiếp Nhận' })]))));
    renderApp({ route: '/admissions/leads', user: makeUser('ACADEMIC_STAFF') });
    const row = (await screen.findByText('Nguyễn Thị Lan', undefined, { timeout: 5000 })).closest('tr') as HTMLElement;
    expect(screen.getByRole('columnheader', { name: 'Người tiếp nhận' })).toBeInTheDocument();
    expect(within(row).getByText('Lê Tiếp Nhận')).toBeInTheDocument();
  });
});

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Họ và tên/), 'Nguyễn Thị Lan');
  await user.click(screen.getByRole('button', { name: /Ngày sinh/ }));
  const grid = await screen.findByRole('grid');
  await user.click(within(grid).getAllByRole('button', { name: /1/ })[0]!);
  await user.click(screen.getByRole('combobox', { name: /Giới tính/ }));
  await user.click(await screen.findByRole('option', { name: 'Nữ' }));
  await user.type(screen.getByLabelText(/Số điện thoại/), '0912345678');
  await user.click(screen.getByRole('combobox', { name: /Khóa học quan tâm/ }));
  await user.click(await screen.findByRole('option', { name: /IELTS Foundation/ }));
}

describe('form tiếp nhận lead', () => {
  it('thiếu SĐT → báo lỗi dưới ô SĐT và không gọi POST', async () => {
    mockCourses();
    let posted = 0;
    server.use(http.post('*/api/v1/leads', () => { posted++; return HttpResponse.json({ data: lead() }, { status: 201 }); }));
    const user = userEvent.setup();
    renderApp({ route: '/admissions/leads/new', user: makeUser('ACADEMIC_STAFF') });
    await user.type(await screen.findByLabelText(/Họ và tên/), 'Nguyễn Thị Lan');
    await user.click(screen.getByRole('button', { name: 'Lưu lead' }));
    expect(await screen.findByText('Vui lòng nhập số điện thoại')).toBeInTheDocument();
    expect(posted).toBe(0);
  });

  it('409 DUPLICATE_PERSON → dialog liệt kê trùng, "Vẫn lưu lead mới" gọi POST ?force=true', async () => {
    mockCourses();
    const urls: string[] = [];
    server.use(
      http.post('*/api/v1/leads', ({ request }) => {
        urls.push(new URL(request.url).search);
        return urls.length === 1 ? dupError() : HttpResponse.json({ data: lead() }, { status: 201 });
      }),
      http.get('*/api/v1/leads/:id', () => HttpResponse.json({ data: lead() })),
    );
    const user = userEvent.setup();
    renderApp({ route: '/admissions/leads/new', user: makeUser('ACADEMIC_STAFF') });
    await screen.findByLabelText(/Họ và tên/);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Lưu lead' }));
    const dialog = await screen.findByRole('dialog', { name: 'Có thể đã tồn tại' });
    expect(within(dialog).getByText(/Nguyễn Thị Lan/)).toBeInTheDocument();
    expect(within(dialog).getByText(/0912345678/)).toBeInTheDocument();
    expect(within(dialog).getByText(/HV2026000001/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Xem hồ sơ' })).toHaveAttribute('href', `/students/${STUDENT_ID}`);
    await user.click(within(dialog).getByRole('button', { name: 'Vẫn lưu lead mới' }));
    await waitFor(() => expect(urls).toEqual(['', '?force=true']));
  });

  it('lỗi server details.fields gắn vào ô tương ứng', async () => {
    mockCourses();
    server.use(
      http.post('*/api/v1/leads', () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION_FAILED', message: 'x', details: { fields: { phone: 'Số điện thoại không hợp lệ' } } } },
          { status: 400 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderApp({ route: '/admissions/leads/new', user: makeUser('ACADEMIC_STAFF') });
    await screen.findByLabelText(/Họ và tên/);
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Lưu lead' }));
    expect(await screen.findByText('Số điện thoại không hợp lệ')).toBeInTheDocument();
  });
});

describe('chi tiết lead và tạo hồ sơ học viên (FR-ADM-03)', () => {
  const convertResult = {
    data: {
      student: { id: STUDENT_ID, code: 'HV2026000007', fullName: 'Nguyễn Thị Lan' },
      tempPassword: 'Tmp-pass-123',
      enrollmentId: '65000000000000000000e001',
    },
  };

  it('"Tạo hồ sơ học viên" → hiện mã HV, mật khẩu tạm và cảnh báo một lần; lead chuyển PROFILE_CREATED', async () => {
    mockCourses();
    let converted = false;
    server.use(
      http.get('*/api/v1/leads/:id', () =>
        HttpResponse.json({ data: converted ? lead({ status: 'PROFILE_CREATED', studentId: STUDENT_ID }) : lead() }),
      ),
      http.post('*/api/v1/leads/:id/convert', () => { converted = true; return HttpResponse.json(convertResult, { status: 201 }); }),
    );
    const user = userEvent.setup();
    renderApp({ route: `/admissions/leads/${LEAD_ID}`, user: makeUser('ACADEMIC_STAFF') });
    await user.click(await screen.findByRole('button', { name: 'Tạo hồ sơ học viên' }));
    const confirm = await screen.findByRole('dialog', { name: /Tạo hồ sơ học viên/ });
    await user.click(within(confirm).getByRole('button', { name: 'Tạo hồ sơ' }));
    const done = await screen.findByRole('dialog', { name: 'Đã tạo hồ sơ học viên' });
    expect(within(done).getByText('HV2026000007')).toBeInTheDocument();
    expect(within(done).getByText('Tmp-pass-123')).toBeInTheDocument();
    expect(within(done).getByText(/Mật khẩu chỉ hiển thị một lần/)).toBeInTheDocument();
    expect(within(done).getByRole('button', { name: 'Sao chép mật khẩu' })).toBeInTheDocument();
    await user.click(within(done).getByRole('button', { name: 'Đóng' }));
    expect(await screen.findByRole('link', { name: 'Xem hồ sơ học viên' })).toHaveAttribute('href', `/students/${STUDENT_ID}`);
    expect(screen.queryByRole('button', { name: 'Tạo hồ sơ học viên' })).not.toBeInTheDocument();
  });

  it('convert 409 DUPLICATE_PERSON → "Vẫn tạo hồ sơ" gọi convert?force=true', async () => {
    mockCourses();
    const searches: string[] = [];
    server.use(
      http.get('*/api/v1/leads/:id', () => HttpResponse.json({ data: lead() })),
      http.post('*/api/v1/leads/:id/convert', ({ request }) => {
        searches.push(new URL(request.url).search);
        return searches.length === 1 ? dupError() : HttpResponse.json(convertResult, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderApp({ route: `/admissions/leads/${LEAD_ID}`, user: makeUser('MANAGER') });
    await user.click(await screen.findByRole('button', { name: 'Tạo hồ sơ học viên' }));
    await user.click(within(await screen.findByRole('dialog', { name: /Tạo hồ sơ học viên/ })).getByRole('button', { name: 'Tạo hồ sơ' }));
    const dup = await screen.findByRole('dialog', { name: 'Có thể đã tồn tại' });
    await user.click(within(dup).getByRole('button', { name: 'Vẫn tạo hồ sơ' }));
    expect(await screen.findByRole('dialog', { name: 'Đã tạo hồ sơ học viên' })).toBeInTheDocument();
    expect(searches).toEqual(['', '?force=true']);
  });
});
