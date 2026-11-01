import { DiscountStatus, InvoiceKind, InvoiceStatus, PaymentStatus, Role } from '@lc/shared';
import { makeClass, makeCourse, makeInvoice, makePayment, makeUser } from '../factories';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

// DEFAULT_NOW = 2026-01-05 09:00 VN
const vn = (d: string, hhmm = '00:00') => new Date(`${d}T${hhmm}:00+07:00`);

describe('FR-RPT-04 Báo cáo tài chính (GET /reports/finance)', () => {
  let t: TestApp;
  let courseA: string;
  let courseB: string;
  let classA: string;

  const get = (token: string, qs: string) => t.http().get(`/api/v1/reports/finance?${qs}`).set({ Authorization: `Bearer ${token}` });
  const setCreated = (id: unknown, at: Date) => t.conn.collection('invoices').updateOne({ _id: id as never }, { $set: { createdAt: at } });

  beforeAll(async () => {
    t = await createTestApp();
    const a = await makeCourse(t.conn);
    const b = await makeCourse(t.conn);
    courseA = a._id.toString();
    courseB = b._id.toString();
    const cls = await makeClass(t.conn, { courseId: a._id });
    classA = cls._id.toString();
    const by = (await makeUser(t.conn))._id;

    // inv1: khóa A, lớp A, tạo 31/01 23:30 VN, nợ 2tr quá hạn, giảm giá APPROVED 500k
    const inv1 = await makeInvoice(t.conn, {
      courseId: a._id, classId: cls._id, amountDue: 3_000_000, finalAmount: 2_500_000, amountPaid: 500_000, balance: 2_000_000,
      status: InvoiceStatus.PARTIAL, dueDate: vn('2026-01-04'),
      discount: { kind: 'AMOUNT', value: 500_000, amount: 500_000, reason: 'x', status: DiscountStatus.APPROVED, requestedBy: by, decidedBy: by, decidedAt: vn('2026-01-31') },
    });
    await setCreated(inv1._id, new Date('2026-01-31T16:30:00Z'));
    // inv2: khóa B, tháng 2, chưa quá hạn, giảm giá PENDING (không tính)
    const inv2 = await makeInvoice(t.conn, {
      courseId: b._id, amountDue: 1_000_000, finalAmount: 1_000_000, balance: 1_000_000, dueDate: vn('2026-03-01'),
      discount: { kind: 'AMOUNT', value: 100_000, amount: 100_000, reason: 'x', status: DiscountStatus.PENDING_APPROVAL, requestedBy: by, decidedBy: null, decidedAt: null },
    });
    await setCreated(inv2._id, vn('2026-02-01', '00:10'));
    // inv3: VOID, tháng 1 -> bị loại
    const inv3 = await makeInvoice(t.conn, { kind: InvoiceKind.SURCHARGE, amountDue: 700_000, finalAmount: 700_000, balance: 700_000, status: InvoiceStatus.VOID, dueDate: vn('2026-01-01') });
    await setCreated(inv3._id, vn('2026-01-15'));
    // inv4: đã trả đủ, quá hạn nhưng balance 0, khóa A
    const inv4 = await makeInvoice(t.conn, { courseId: a._id, amountDue: 1_500_000, finalAmount: 1_500_000, amountPaid: 1_500_000, balance: 0, status: InvoiceStatus.PAID, dueDate: vn('2026-01-02') });
    await setCreated(inv4._id, vn('2026-01-10'));

    await makePayment(t.conn, { invoiceId: inv1._id, amount: 500_000, paidAt: new Date('2026-01-31T16:30:00Z') }); // 31/01 23:30 VN
    await makePayment(t.conn, { invoiceId: inv4._id, amount: 1_500_000, paidAt: vn('2026-02-01', '00:10') }); // tháng 2
    await makePayment(t.conn, { invoiceId: inv4._id, amount: 999_000, paidAt: vn('2026-01-20'), status: PaymentStatus.VOIDED });
  });
  afterAll(async () => {
    await t.close();
  });

  const R = '2026-01-01';
  const R2 = '2026-02-28';
  const token = async () => (await loginAs(t, Role.MANAGER)).token;

  it('FR-RPT-04 payment 31/01 23:30 VN (16:30Z) thuộc tháng 2026-01 khi groupBy=month', async () => {
    const r = await get(await token(), `from=${R}&to=${R2}&groupBy=month`);
    expect(r.status).toBe(200);
    const by = Object.fromEntries(r.body.data.rows.map((x: { key: string }) => [x.key, x]));
    expect(by['2026-01'].revenue).toBe(500_000);
    expect(by['2026-02'].revenue).toBe(1_500_000);
    expect(by['2026-01'].totalDue).toBe(2_500_000 + 1_500_000); // inv1 + inv4, không VOID
    expect(by['2026-02'].totalDue).toBe(1_000_000);
    expect(r.body.data.rows.map((x: { key: string }) => x.key)).toEqual(['2026-01', '2026-02']);
    expect(r.body.data.rows.map((x: { label: string }) => x.label)).toEqual(['Tháng 01/2026', 'Tháng 02/2026']);
  });

  it('FR-RPT-04 payment VOIDED không tính revenue', async () => {
    const r = await get(await token(), `from=${R}&to=${R2}`);
    expect(r.body.data.totals.revenue).toBe(2_000_000);
  });

  it('FR-RPT-04 outstanding = Σ balance hóa đơn ≠ VOID', async () => {
    const r = await get(await token(), `from=${R}&to=${R2}`);
    expect(r.body.data.totals.outstanding).toBe(2_000_000 + 1_000_000);
    expect(r.body.data.totals.totalDue).toBe(5_000_000);
  });

  it('FR-RPT-04 overdue chỉ hóa đơn quá hạn còn nợ', async () => {
    const r = await get(await token(), `from=${R}&to=${R2}`);
    expect(r.body.data.totals.overdue).toBe(2_000_000);
  });

  it('FR-RPT-04 totalDiscount chỉ APPROVED', async () => {
    const r = await get(await token(), `from=${R}&to=${R2}`);
    expect(r.body.data.totals.totalDiscount).toBe(500_000);
  });

  it('FR-RPT-04 hóa đơn ngoài khoảng createdAt không tính, payment ngoài khoảng paidAt không tính', async () => {
    const r = await get(await token(), 'from=2026-02-01&to=2026-02-28');
    expect(r.body.data.totals).toEqual({ revenue: 1_500_000, totalDue: 1_000_000, outstanding: 1_000_000, overdue: 0, totalDiscount: 0 });
  });

  it('FR-RPT-04 groupBy=course gom đúng theo invoice.courseId', async () => {
    const r = await get(await token(), `from=${R}&to=${R2}&groupBy=course`);
    const by = Object.fromEntries(r.body.data.rows.map((x: { key: string }) => [x.key, x]));
    expect(by[courseA]).toMatchObject({ revenue: 2_000_000, totalDue: 4_000_000, outstanding: 2_000_000, overdue: 2_000_000, totalDiscount: 500_000 });
    expect(by[courseB]).toMatchObject({ revenue: 0, totalDue: 1_000_000, outstanding: 1_000_000, totalDiscount: 0 });
    expect(typeof by[courseA].label).toBe('string');
  });

  it('FR-RPT-04 groupBy=class gom đúng theo invoice.classId', async () => {
    const r = await get(await token(), `from=${R}&to=${R2}&groupBy=class`);
    const row = r.body.data.rows.find((x: { key: string }) => x.key === classA);
    expect(row).toMatchObject({ revenue: 500_000, totalDue: 2_500_000, outstanding: 2_000_000 });
  });

  it('FR-RPT-04 courseId lọc', async () => {
    const r = await get(await token(), `from=${R}&to=${R2}&courseId=${courseB}`);
    expect(r.body.data.totals).toMatchObject({ revenue: 0, totalDue: 1_000_000 });
  });

  it('FR-RPT-04 from > to -> 400; thiếu to -> 400', async () => {
    const tk = await token();
    const r = await get(tk, 'from=2026-02-01&to=2026-01-01');
    expect(r.status).toBe(400);
    expect(r.body.error.details.fields).toHaveProperty('to');
    await get(tk, 'from=2026-02-01').expect(400);
  });

  it.each([Role.TEACHER, Role.STUDENT, Role.ADMIN])('FR-RPT-04 %s -> 403', async (role) => {
    await get((await loginAs(t, role)).token, `from=${R}&to=${R2}`).expect(403);
  });
});
