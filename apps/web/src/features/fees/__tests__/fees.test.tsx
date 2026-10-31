import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../../test/msw/server';
import { renderApp } from '../../../../test/render';
import { makeUser } from '../../../../test/users';

const INV_ID = '65000000000000000000f001';
const STU_ID = '65000000000000000000a001';
const T = { timeout: 10_000 };

const invoice = (over: Record<string, unknown> = {}) => ({
  id: INV_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  code: 'HD2026000001',
  kind: 'TUITION',
  studentId: STU_ID,
  enrollmentId: null,
  courseId: null,
  classId: null,
  description: null,
  amountDue: 3000000,
  discount: null,
  finalAmount: 3000000,
  amountPaid: 2000000,
  balance: 1000000,
  dueDate: '2026-02-10',
  status: 'PARTIAL',
  studentName: 'Nguyễn Văn A',
  studentCode: 'HV20260001',
  overdue: false,
  ...over,
});
const payment = (over: Record<string, unknown> = {}) => ({
  id: '65000000000000000000b001',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  code: 'PT2026000001',
  invoiceId: INV_ID,
  studentId: STU_ID,
  amount: 2000000,
  method: 'CASH',
  paidAt: '2026-01-02T03:00:00.000Z',
  note: null,
  status: 'VALID',
  voidReason: null,
  voidedBy: null,
  voidedAt: null,
  recordedBy: '650000000000000000000001',
  ...over,
});
const discount = (over: Record<string, unknown> = {}) => ({
  kind: 'PERCENT',
  value: 10,
  amount: 300000,
  reason: 'Anh em ruột',
  status: 'PENDING_APPROVAL',
  requestedBy: '650000000000000000000002',
  decidedBy: null,
  decidedAt: null,
  ...over,
});
const page = (data: unknown[]) =>
  HttpResponse.json({ data, meta: { page: 1, limit: 20, total: data.length } });
const detail = (over: Record<string, unknown> = {}, payments: unknown[] = [payment()]) =>
  server.use(
    http.get('*/api/v1/invoices/:id', () => HttpResponse.json({ data: { ...invoice(over), payments } })),
  );

describe('chi tiết hóa đơn', () => {
  it('dialog thanh toán: mặc định = còn nợ, nhập vượt → lỗi tại chỗ, không gọi POST', async () => {
    detail();
    let posted = 0;
    server.use(http.post('*/api/v1/invoices/:id/payments', () => { posted++; return HttpResponse.json({ data: {} }); }));
    renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('MANAGER') });
    await userEvent.click(await screen.findByRole('button', { name: 'Ghi nhận thanh toán' }, T));
    const amount = await screen.findByLabelText('Số tiền');
    expect(amount).toHaveValue('1.000.000');
    await userEvent.clear(amount);
    await userEvent.type(amount, '1200000');
    await userEvent.click(screen.getByRole('button', { name: 'Ghi nhận' }));
    expect(await screen.findByText('Số tiền vượt quá số còn nợ')).toBeInTheDocument();
    expect(posted).toBe(0);
  });

  it('overdue=true → badge "Quá hạn"', async () => {
    detail({ overdue: true });
    renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('ACADEMIC_STAFF') });
    expect(await screen.findByText('Quá hạn', {}, T)).toBeInTheDocument();
  });

  it('M thấy nút Duyệt/Từ chối giảm giá, S không thấy', async () => {
    detail({ discount: discount() });
    const first = renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('MANAGER') });
    expect(await screen.findByRole('button', { name: 'Duyệt' }, T)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument();
    first.unmount();
    renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('ACADEMIC_STAFF') });
    await screen.findByText('Chờ duyệt', {}, T);
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument();
  });

  it('M thấy nút Hủy phiếu thu, S không', async () => {
    detail();
    const first = renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('MANAGER') });
    expect(await screen.findByRole('button', { name: 'Hủy phiếu thu' }, T)).toBeInTheDocument();
    first.unmount();
    renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('ACADEMIC_STAFF') });
    await screen.findByText('PT2026000001', {}, T);
    expect(screen.queryByRole('button', { name: 'Hủy phiếu thu' })).not.toBeInTheDocument();
  });

  it('giảm giá REJECTED → lại thấy "Đề xuất giảm giá"; PENDING_APPROVAL → không', async () => {
    detail({ discount: discount({ status: 'REJECTED' }) });
    const first = renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('ACADEMIC_STAFF') });
    expect(await screen.findByRole('button', { name: 'Đề xuất giảm giá' }, T)).toBeInTheDocument();
    first.unmount();
    detail({ discount: discount() });
    renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('ACADEMIC_STAFF') });
    await screen.findByText('Chờ duyệt', {}, T);
    expect(screen.queryByRole('button', { name: 'Đề xuất giảm giá' })).not.toBeInTheDocument();
  });

  it('"Hủy hóa đơn" ẩn khi đã đóng tiền (amountPaid > 0), hiện khi chưa đóng', async () => {
    detail();
    const first = renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('MANAGER') });
    await screen.findByText('PT2026000001', {}, T);
    expect(screen.queryByRole('button', { name: 'Hủy hóa đơn' })).not.toBeInTheDocument();
    first.unmount();
    detail({ amountPaid: 0, balance: 3000000, status: 'UNPAID' }, []);
    renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('MANAGER') });
    expect(await screen.findByRole('button', { name: 'Hủy hóa đơn' }, T)).toBeInTheDocument();
  });

  it('in phiếu → tải payments/:id/receipt.pdf', async () => {
    detail();
    let hit = '';
    server.use(
      http.get('*/api/v1/payments/:id/receipt.pdf', ({ params }) => {
        hit = String(params.id);
        return new HttpResponse(new Uint8Array([37, 80, 68, 70]), { headers: { 'Content-Type': 'application/pdf' } });
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue(null);
    renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('ACADEMIC_STAFF') });
    await userEvent.click(await screen.findByRole('button', { name: 'In phiếu' }, T));
    await waitFor(() => expect(hit).toBe('65000000000000000000b001'));
  });
});

describe('học phí của tôi', () => {
  it('mỗi hóa đơn một thẻ: còn nợ, hạn dd/MM/yyyy, trạng thái', async () => {
    server.use(http.get('*/api/v1/invoices', () => page([invoice(), invoice({ id: 'x2', code: 'HD2026000002', status: 'PAID', balance: 0 })])));
    renderApp({ route: '/me/fees', user: makeUser('STUDENT') });
    const cards = await screen.findAllByRole('article', {}, T);
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText('1.000.000 ₫')).toBeInTheDocument();
    expect(within(cards[0]!).getByText(/10\/02\/2026/)).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Thanh toán một phần')).toBeInTheDocument();
  });
});

describe('danh sách hóa đơn', () => {
  it('chân bảng = tổng các dòng trang hiện tại (D20)', async () => {
    server.use(
      http.get('*/api/v1/invoices', () =>
        page([
          invoice({ finalAmount: 3000000, amountPaid: 2000000, balance: 1000000 }),
          invoice({ id: 'x2', code: 'HD2026000002', finalAmount: 1000000, amountPaid: 500000, balance: 500000 }),
        ]),
      ),
    );
    renderApp({ route: '/fees', user: makeUser('MANAGER') });
    const foot = await screen.findByTestId('fees-total', {}, T);
    expect(within(foot).getByText('4.000.000 ₫')).toBeInTheDocument();
    expect(within(foot).getByText('2.500.000 ₫')).toBeInTheDocument();
    expect(within(foot).getByText('1.500.000 ₫')).toBeInTheDocument();
  });

  it('GV ở /fees: chỉ cột trạng thái + còn nợ', async () => {
    server.use(
      http.get('*/api/v1/invoices', () =>
        page([{ id: INV_ID, code: 'HD2026000001', kind: 'TUITION', studentId: STU_ID, studentName: 'Nguyễn Văn A',
          studentCode: 'HV20260001', classId: null, balance: 1000000, dueDate: '2026-02-10', status: 'PARTIAL', overdue: false }]),
      ),
    );
    renderApp({ route: '/fees', user: makeUser('TEACHER') });
    await screen.findByText('Nguyễn Văn A', {}, T);
    expect(screen.getByRole('columnheader', { name: 'Trạng thái' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Còn nợ' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Phải đóng' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Đã đóng' })).not.toBeInTheDocument();
  });
});

describe('duyệt giảm giá', () => {
  it('liệt kê GET /invoices/discounts/pending', async () => {
    server.use(http.get('*/api/v1/invoices/discounts/pending', () => page([invoice({ discount: discount(), status: 'UNPAID' })])));
    renderApp({ route: '/fees/discounts', user: makeUser('MANAGER') });
    expect(await screen.findByText('HD2026000001', {}, T)).toBeInTheDocument();
    expect(screen.getByText('Anh em ruột')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeInTheDocument();
  });
});

describe('đề xuất giảm giá', () => {
  it('S gửi đề xuất → POST /invoices/:id/discount với dữ liệu form', async () => {
    detail();
    let body: unknown;
    server.use(
      http.post('*/api/v1/invoices/:id/discount', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: invoice() });
      }),
    );
    renderApp({ route: `/fees/invoices/${INV_ID}`, user: makeUser('ACADEMIC_STAFF') });
    await userEvent.click(await screen.findByRole('button', { name: 'Đề xuất giảm giá' }, T));
    await userEvent.type(await screen.findByLabelText('Giá trị'), '150');
    await userEvent.type(screen.getByLabelText('Lý do'), 'Anh em ruột');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));
    expect(await screen.findByText('Phần trăm giảm tối đa 100')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Giá trị'));
    await userEvent.type(screen.getByLabelText('Giá trị'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));
    await waitFor(() => expect(body).toEqual({ kind: 'PERCENT', value: 10, reason: 'Anh em ruột' }));
  });
});
