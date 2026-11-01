import { Role } from '@lc/shared';
import { Models } from '../../src/database/models';
import { makeInvoice, makePayment, makeStudent } from '../factories';
import { assertInvoiceInvariants } from '../factories/fees.extra';
import { loginAs } from '../helpers/auth';
import { isOverdue } from '../../src/modules/fees/fees.mapper';
import { createTestApp, DEFAULT_NOW, TestApp } from '../helpers/test-app';

describe('FR-FEE-04 FR-FEE-05 Thanh toán, hủy phiếu thu, quá hạn', () => {
  let t: TestApp;
  let manager: { token: string };
  let staff: { token: string };
  const tokens: Partial<Record<Role, string>> = {};

  beforeAll(async () => {
    t = await createTestApp();
    manager = await loginAs(t, Role.MANAGER);
    staff = await loginAs(t, Role.ACADEMIC_STAFF);
    for (const r of [Role.TEACHER, Role.STUDENT, Role.ADMIN]) tokens[r] = (await loginAs(t, r)).token;
  });
  beforeEach(() => t.clock.set(DEFAULT_NOW));
  afterEach(async () => {
    await assertInvoiceInvariants(t.conn);
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const pay = (id: unknown, body: unknown, token = staff.token) =>
    t.http().post(`/api/v1/invoices/${String(id)}/payments`).set(auth(token)).send(body as object);
  const voidPay = (id: unknown, body: unknown, token = manager.token) =>
    t.http().post(`/api/v1/payments/${String(id)}/void`).set(auth(token)).send(body as object);
  const voidInv = (id: unknown, body: unknown = {}, token = manager.token) =>
    t.http().post(`/api/v1/invoices/${String(id)}/void`).set(auth(token)).send(body as object);
  const cash = (amount: number) => ({ amount, method: 'CASH' });

  it('FR-FEE-04: một phần -> PARTIAL, đủ -> PAID; mã PT2026…', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_000_000 });
    const r1 = await pay(inv._id, cash(400_000)).expect(201);
    expect(r1.body.data).toMatchObject({ amount: 400_000, status: 'VALID', invoiceId: String(inv._id) });
    expect(r1.body.data.code).toMatch(/^PT202601\d{4}$/);
    expect(r1.body.data.paidAt).toBe(DEFAULT_NOW.toISOString());
    expect(await t.conn.model(Models.Invoice).findById(inv._id).lean()).toMatchObject({ amountPaid: 400_000, balance: 600_000, status: 'PARTIAL' });
    await pay(inv._id, cash(600_000), manager.token).expect(201);
    expect(await t.conn.model(Models.Invoice).findById(inv._id).lean()).toMatchObject({ amountPaid: 1_000_000, balance: 0, status: 'PAID' });
  });

  it('FR-FEE-04: payment > balance -> 422 PAYMENT_EXCEEDS_BALANCE', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_000_000 });
    const res = await pay(inv._id, cash(1_000_001)).expect(422);
    expect(res.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
  });

  it.each([0, -1, 1.5])('FR-FEE-04: amount %s -> 400 VALIDATION_FAILED', async (amount) => {
    const inv = await makeInvoice(t.conn);
    const res = await pay(inv._id, cash(amount)).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('FR-FEE-04: 2 payment song song 600k + 600k trên balance 1M -> 1×201, 1×422, amountPaid 600k', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_000_000 });
    const rs = await Promise.all([pay(inv._id, cash(600_000)), pay(inv._id, cash(600_000), manager.token)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(rs.find((r) => r.status === 422)?.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
    expect(await t.conn.model(Models.Invoice).findById(inv._id).lean()).toMatchObject({ amountPaid: 600_000, balance: 400_000 });
    expect(await t.conn.model(Models.Payment).countDocuments({ invoiceId: inv._id })).toBe(1);
  });

  it('FR-FEE-04: invoice VOID nhận payment -> 422 INVOICE_VOID', async () => {
    const inv = await makeInvoice(t.conn, { status: 'VOID' });
    const res = await pay(inv._id, cash(1000)).expect(422);
    expect(res.body.error.code).toBe('INVOICE_VOID');
  });

  it('FR-FEE-04: ghi payment gửi thông báo PAYMENT_RECORDED tới user HV', async () => {
    const st = await makeStudent(t.conn, { withUser: true });
    const inv = await makeInvoice(t.conn, { studentId: st._id });
    await pay(inv._id, cash(100_000)).expect(201);
    const notes = await t.conn.model(Models.Notification).find({ type: 'PAYMENT_RECORDED', refId: inv._id }).lean();
    expect(notes).toHaveLength(1);
    expect(String(notes[0].userId)).toBe(String(st.userId));
  });

  it('FR-FEE-04: invoice không tồn tại / id sai -> 404', async () => {
    await pay('64b000000000000000000000', cash(1000)).expect(404);
    await pay('xyz', cash(1000)).expect(404);
  });

  it('FR-FEE-05: M hủy payment (lý do) -> amountPaid giảm, PAID -> PARTIAL, ghi voidReason/voidedBy', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_000_000 });
    await pay(inv._id, cash(400_000)).expect(201);
    const p2 = await pay(inv._id, cash(600_000)).expect(201);
    const res = await voidPay(p2.body.data.id, { reason: 'Nhập nhầm' }).expect(200);
    expect(res.body.data).toMatchObject({ status: 'VOIDED', voidReason: 'Nhập nhầm' });
    expect(res.body.data.voidedBy).toEqual(expect.any(String));
    expect(res.body.data.voidedAt).toBe(DEFAULT_NOW.toISOString());
    expect(await t.conn.model(Models.Invoice).findById(inv._id).lean()).toMatchObject({ amountPaid: 400_000, balance: 600_000, status: 'PARTIAL' });
  });

  it('FR-FEE-05: hủy payment duy nhất -> UNPAID', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 500_000 });
    const p = await pay(inv._id, cash(200_000)).expect(201);
    await voidPay(p.body.data.id, { reason: 'Sai' }).expect(200);
    expect(await t.conn.model(Models.Invoice).findById(inv._id).lean()).toMatchObject({ amountPaid: 0, status: 'UNPAID' });
  });

  it('FR-FEE-05: lý do rỗng -> 400 REASON_REQUIRED', async () => {
    const inv = await makeInvoice(t.conn);
    const p = await pay(inv._id, cash(1000)).expect(201);
    const res = await voidPay(p.body.data.id, { reason: '   ' }).expect(400);
    expect(res.body.error.code).toBe('REASON_REQUIRED');
  });

  it('FR-FEE-05: hủy lại payment đã VOIDED -> 422 INVALID_STATUS_TRANSITION', async () => {
    const inv = await makeInvoice(t.conn);
    const p = await pay(inv._id, cash(1000)).expect(201);
    await voidPay(p.body.data.id, { reason: 'a' }).expect(200);
    const res = await voidPay(p.body.data.id, { reason: 'b' }).expect(422);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('FR-FEE-05: hủy payment không tồn tại -> 404', async () => {
    await voidPay('64b000000000000000000000', { reason: 'x' }).expect(404);
  });

  it('FR-FEE-05: M hủy hóa đơn không có payment -> VOID; audit ghi lý do', async () => {
    const inv = await makeInvoice(t.conn);
    const res = await voidInv(inv._id, { reason: 'Lập sai' }).expect(200);
    expect(res.body.data.status).toBe('VOID');
    const log = await t.conn.model(Models.AuditLog).findOne({ entity: 'invoice', entityId: inv._id }).lean();
    expect(JSON.stringify(log)).toContain('Lập sai');
  });

  it('FR-FEE-05: hủy hóa đơn có payment VALID -> 422; payment đã VOIDED thì được', async () => {
    const inv = await makeInvoice(t.conn);
    const p = await pay(inv._id, cash(1000)).expect(201);
    const res = await voidInv(inv._id).expect(422);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    await voidPay(p.body.data.id, { reason: 'x' }).expect(200);
    await voidInv(inv._id).expect(200);
  });

  it('FR-FEE-05: hủy hóa đơn đã VOID -> 422 INVALID_STATUS_TRANSITION', async () => {
    const inv = await makeInvoice(t.conn);
    await voidInv(inv._id).expect(200);
    const res = await voidInv(inv._id).expect(422);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('FR-FEE-05: hủy hóa đơn / payment khi factory dựng sẵn (payment VALID) -> 422', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_000_000, amountPaid: 1_000_000, balance: 0, status: 'PAID' });
    await makePayment(t.conn, { invoiceId: inv._id, amount: 1_000_000 });
    await voidInv(inv._id).expect(422);
  });

  describe('overdue (ranh giới ngày VN)', () => {
    const due = new Date('2026-01-05T00:00:00+07:00');
    it('FR-FEE-04: dueDate 2026-01-05, 23:59 VN -> overdue false; 00:00 VN ngày kế -> true; PAID/VOID không overdue', async () => {
      const unpaid = await makeInvoice(t.conn, { dueDate: due });
      const paid = await makeInvoice(t.conn, { dueDate: due, amountDue: 1000, amountPaid: 1000, balance: 0, status: 'PAID' });
      const voided = await makeInvoice(t.conn, { dueDate: due, status: 'VOID' });
      const lean = async (i: { _id: unknown }) => (await t.conn.model(Models.Invoice).findById(i._id).lean()) as never;
      const at = (iso: string) => new Date(iso);
      expect(isOverdue(await lean(unpaid), at('2026-01-05T16:59:00Z'))).toBe(false);
      expect(isOverdue(await lean(unpaid), at('2026-01-05T17:00:00Z'))).toBe(true);
      expect(isOverdue(await lean(paid), at('2026-02-01T00:00:00Z'))).toBe(false);
      expect(isOverdue(await lean(voided), at('2026-02-01T00:00:00Z'))).toBe(false);
      await makePayment(t.conn, { invoiceId: paid._id, amount: 1000 });
    });
  });

  describe('phân quyền', () => {
    it.each([Role.TEACHER, Role.STUDENT, Role.ADMIN] as const)('%s ghi payment / hủy -> 403', async (role) => {
      const inv = await makeInvoice(t.conn);
      await pay(inv._id, cash(1000), tokens[role]!).expect(403);
      await voidPay(inv._id, { reason: 'x' }, tokens[role]!).expect(403);
      await voidInv(inv._id, {}, tokens[role]!).expect(403);
    });
    it('S hủy payment / hủy hóa đơn -> 403', async () => {
      const inv = await makeInvoice(t.conn);
      const p = await pay(inv._id, cash(1000)).expect(201);
      await voidPay(p.body.data.id, { reason: 'x' }, staff.token).expect(403);
      await voidInv(inv._id, {}, staff.token).expect(403);
    });
    it('không token -> 401', async () => {
      await t.http().post('/api/v1/invoices/64b000000000000000000000/payments').send(cash(1)).expect(401);
    });
  });
});
