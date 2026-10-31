import { Role } from '@lc/shared';
import { Models } from '../../src/database/models';
import { makeInvoice, makePayment } from '../factories';
import { assertInvoiceInvariants } from '../factories/fees.extra';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-FEE-03 Giảm giá có duyệt', () => {
  let t: TestApp;
  let manager: { token: string; user: { _id: unknown } };
  let staff: { token: string; user: { _id: unknown } };
  const tokens: Partial<Record<Role, string>> = {};

  beforeAll(async () => {
    t = await createTestApp();
    manager = await loginAs(t, Role.MANAGER);
    staff = await loginAs(t, Role.ACADEMIC_STAFF);
    for (const r of [Role.TEACHER, Role.STUDENT, Role.ADMIN]) tokens[r] = (await loginAs(t, r)).token;
  });
  afterEach(async () => {
    await assertInvoiceInvariants(t.conn);
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const propose = (id: unknown, body: unknown, token = staff.token) =>
    t.http().post(`/api/v1/invoices/${String(id)}/discount`).set(auth(token)).send(body as object);
  const decide = (id: unknown, body: unknown, token = manager.token) =>
    t.http().post(`/api/v1/invoices/${String(id)}/discount/decision`).set(auth(token)).send(body as object);
  const tenPercent = { kind: 'PERCENT', value: 10, reason: 'Anh em ruột' };

  it('FR-FEE-03: S đề xuất 10% trên 1_555_555 -> PENDING_APPROVAL, discount.amount 155_556, finalAmount giữ nguyên', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_555_555 });
    const res = await propose(inv._id, tenPercent).expect(201);
    expect(res.body.data).toMatchObject({
      finalAmount: 1_555_555,
      balance: 1_555_555,
      discount: { status: 'PENDING_APPROVAL', amount: 155_556, kind: 'PERCENT', value: 10, reason: 'Anh em ruột', requestedBy: String(staff.user._id), decidedBy: null },
    });
  });

  it('FR-FEE-03: M duyệt -> APPROVED, finalAmount 1_399_999, balance cập nhật', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_555_555 });
    await propose(inv._id, tenPercent).expect(201);
    const res = await decide(inv._id, { approve: true }).expect(200);
    expect(res.body.data).toMatchObject({
      finalAmount: 1_399_999,
      balance: 1_399_999,
      status: 'UNPAID',
      discount: { status: 'APPROVED', decidedBy: String(manager.user._id) },
    });
    expect(res.body.data.discount.decidedAt).toEqual(expect.any(String));
  });

  it('FR-FEE-03: duyệt khi đã đóng một phần -> balance = final - paid, PARTIAL; đóng đủ -> PAID', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_000_000, amountPaid: 900_000, balance: 100_000, status: 'PARTIAL' });
    await makePayment(t.conn, { invoiceId: inv._id, amount: 900_000 });
    await propose(inv._id, { kind: 'AMOUNT', value: 100_000, reason: 'Khuyến mãi' }).expect(201);
    const res = await decide(inv._id, { approve: true }).expect(200);
    expect(res.body.data).toMatchObject({ finalAmount: 900_000, balance: 0, status: 'PAID' });
  });

  it('FR-FEE-03: M từ chối -> REJECTED, finalAmount không đổi', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 2_000_000 });
    await propose(inv._id, tenPercent).expect(201);
    const res = await decide(inv._id, { approve: false, note: 'Không đủ điều kiện' }).expect(200);
    expect(res.body.data).toMatchObject({ finalAmount: 2_000_000, balance: 2_000_000, discount: { status: 'REJECTED' } });
  });

  it('FR-FEE-03: sau khi bị từ chối S đề xuất lại (thay thế) được', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 2_000_000 });
    await propose(inv._id, tenPercent).expect(201);
    await decide(inv._id, { approve: false }).expect(200);
    const res = await propose(inv._id, { kind: 'AMOUNT', value: 50_000, reason: 'Đề xuất lại' }).expect(201);
    expect(res.body.data.discount).toMatchObject({ status: 'PENDING_APPROVAL', kind: 'AMOUNT', amount: 50_000 });
  });

  it('FR-FEE-03: đang PENDING hoặc APPROVED -> đề xuất mới 422 DISCOUNT_NOT_PENDING', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 2_000_000 });
    await propose(inv._id, tenPercent).expect(201);
    expect((await propose(inv._id, tenPercent).expect(422)).body.error.code).toBe('DISCOUNT_NOT_PENDING');
    await decide(inv._id, { approve: true }).expect(200);
    expect((await propose(inv._id, tenPercent, manager.token).expect(422)).body.error.code).toBe('DISCOUNT_NOT_PENDING');
  });

  it('FR-FEE-03: decision khi không pending -> 422 DISCOUNT_NOT_PENDING (chưa có / đã quyết định)', async () => {
    const inv = await makeInvoice(t.conn);
    expect((await decide(inv._id, { approve: true }).expect(422)).body.error.code).toBe('DISCOUNT_NOT_PENDING');
    await propose(inv._id, tenPercent).expect(201);
    await decide(inv._id, { approve: true }).expect(200);
    expect((await decide(inv._id, { approve: false }).expect(422)).body.error.code).toBe('DISCOUNT_NOT_PENDING');
  });

  it('FR-FEE-03: AMOUNT > amountDue -> 400 DISCOUNT_INVALID', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_000_000 });
    const res = await propose(inv._id, { kind: 'AMOUNT', value: 1_000_001, reason: 'x' }).expect(400);
    expect(res.body.error.code).toBe('DISCOUNT_INVALID');
  });

  it('FR-FEE-03: PERCENT 120 -> 400 DISCOUNT_INVALID', async () => {
    const inv = await makeInvoice(t.conn);
    const res = await propose(inv._id, { kind: 'PERCENT', value: 120, reason: 'x' }).expect(400);
    expect(res.body.error.code).toBe('DISCOUNT_INVALID');
  });

  it('FR-FEE-03: giảm làm finalAmount < amountPaid -> 400 DISCOUNT_INVALID', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_000_000, amountPaid: 800_000, balance: 200_000, status: 'PARTIAL' });
    await makePayment(t.conn, { invoiceId: inv._id, amount: 800_000 });
    const res = await propose(inv._id, { kind: 'AMOUNT', value: 300_000, reason: 'x' }, manager.token).expect(400);
    expect(res.body.error.code).toBe('DISCOUNT_INVALID');
  });

  it('FR-FEE-03: M tự áp -> APPROVED ngay, finalAmount mới', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 1_555_555 });
    const res = await propose(inv._id, tenPercent, manager.token).expect(201);
    expect(res.body.data).toMatchObject({
      finalAmount: 1_399_999,
      balance: 1_399_999,
      discount: { status: 'APPROVED', decidedBy: String(manager.user._id), requestedBy: String(manager.user._id) },
    });
  });

  it('FR-FEE-03: hóa đơn VOID -> 422 INVOICE_VOID; không tồn tại / id sai -> 404', async () => {
    const inv = await makeInvoice(t.conn, { status: 'VOID' });
    expect((await propose(inv._id, tenPercent).expect(422)).body.error.code).toBe('INVOICE_VOID');
    await propose('64b000000000000000000000', tenPercent).expect(404);
    await propose('abc', tenPercent).expect(404);
    await decide('64b000000000000000000000', { approve: true }).expect(404);
  });

  it('FR-FEE-03: body sai -> 400', async () => {
    const inv = await makeInvoice(t.conn);
    await propose(inv._id, { kind: 'PERCENT', value: 5 }).expect(400);
    await decide(inv._id, {}).expect(400);
  });

  it('FR-FEE-03: S gọi decision -> 403; T, H, A không được đề xuất / duyệt / xem danh sách chờ', async () => {
    const inv = await makeInvoice(t.conn);
    await propose(inv._id, tenPercent).expect(201);
    await decide(inv._id, { approve: true }, staff.token).expect(403);
    for (const r of [Role.TEACHER, Role.STUDENT, Role.ADMIN]) {
      const tk = tokens[r] as string;
      await propose(inv._id, tenPercent, tk).expect(403);
      await decide(inv._id, { approve: true }, tk).expect(403);
      await t.http().get('/api/v1/invoices/discounts/pending').set(auth(tk)).expect(403);
    }
    await t.http().get('/api/v1/invoices/discounts/pending').set(auth(staff.token)).expect(403);
    await t.http().post(`/api/v1/invoices/${inv._id}/discount`).send(tenPercent).expect(401);
  });

  it('FR-FEE-03: DISCOUNT_DECIDED tới người đề xuất (refType INVOICE), gửi sau commit', async () => {
    const inv = await makeInvoice(t.conn);
    await propose(inv._id, tenPercent).expect(201);
    const before = await t.conn.model(Models.Notification).countDocuments({ type: 'DISCOUNT_DECIDED' });
    await decide(inv._id, { approve: true }).expect(200);
    const notes = await t.conn.model(Models.Notification).find({ type: 'DISCOUNT_DECIDED', refId: inv._id }).lean();
    expect(notes).toHaveLength(1);
    expect(String(notes[0]?.userId)).toBe(String(staff.user._id));
    expect(notes[0]).toMatchObject({ refType: 'INVOICE' });
    expect(await t.conn.model(Models.Notification).countDocuments({ type: 'DISCOUNT_DECIDED' })).toBe(before + 1);
  });

  it('FR-FEE-03: ghi audit entity invoice cho đề xuất và quyết định', async () => {
    const inv = await makeInvoice(t.conn);
    await propose(inv._id, tenPercent).expect(201);
    await decide(inv._id, { approve: true }).expect(200);
    const logs = await t.conn.model(Models.AuditLog).find({ entity: 'invoice', entityId: inv._id }).lean();
    expect(logs).toHaveLength(2);
  });

  it('FR-FEE-03: /invoices/discounts/pending chỉ trả hóa đơn PENDING, có phân trang', async () => {
    const a = await makeInvoice(t.conn);
    const b = await makeInvoice(t.conn);
    const c = await makeInvoice(t.conn);
    await makeInvoice(t.conn);
    await propose(a._id, tenPercent).expect(201);
    await propose(b._id, tenPercent).expect(201);
    await propose(c._id, tenPercent).expect(201);
    await decide(c._id, { approve: false }).expect(200);
    const res = await t.http().get('/api/v1/invoices/discounts/pending').set(auth(manager.token)).expect(200);
    const ids = (res.body.data as { id: string; discount: { status: string } }[]).map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining([String(a._id), String(b._id)]));
    expect(ids).not.toContain(String(c._id));
    expect(res.body.data.every((d: { discount: { status: string } }) => d.discount.status === 'PENDING_APPROVAL')).toBe(true);
    expect(res.body.meta.total).toBe(res.body.data.length);
    expect(res.body.data[0]).toMatchObject({ studentName: expect.any(String), studentCode: expect.any(String) });
  });

  it('FR-FEE-03: 2 đề xuất song song cùng hóa đơn -> chỉ 1 thành công', async () => {
    const inv = await makeInvoice(t.conn);
    const rs = await Promise.all([propose(inv._id, tenPercent), propose(inv._id, tenPercent, manager.token)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 422]);
  });
});
