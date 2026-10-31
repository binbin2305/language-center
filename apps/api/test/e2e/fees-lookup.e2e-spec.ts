import { Types } from 'mongoose';
import { Role } from '@lc/shared';
import { Models } from '../../src/database/models';
import { makeClass, makeEnrollment, makeInvoice, makePayment, makeStudent } from '../factories';
import { loginAs } from '../helpers/auth';
import { pdfText } from '../helpers/pdf-text';
import { createTestApp, DEFAULT_NOW, TestApp } from '../helpers/test-app';

describe('FR-FEE-06/07 Tra cứu hóa đơn, phụ thu, phiếu thu', () => {
  let t: TestApp;
  let manager: { token: string };
  let staff: { token: string; user: { _id: Types.ObjectId } };
  let admin: { token: string };
  let teacher: { token: string; user: { _id: Types.ObjectId } };

  beforeAll(async () => {
    t = await createTestApp();
    manager = await loginAs(t, Role.MANAGER);
    staff = await loginAs(t, Role.ACADEMIC_STAFF);
    admin = await loginAs(t, Role.ADMIN);
    teacher = await loginAs(t, Role.TEACHER);
  });
  beforeEach(() => t.clock.set(DEFAULT_NOW));
  afterAll(async () => {
    await t.close();
  });

  const staffUserId = () => staff.user._id;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token: string) => t.http().get(`/api/v1${url}`).set(auth(token));
  const student = async () => {
    const st = await makeStudent(t.conn);
    return { st, token: (await loginAs(t, Role.STUDENT, { studentId: st._id })).token };
  };

  it('FR-FEE-06: HV chỉ thấy hóa đơn mình; GET /invoices/:id người khác -> 404', async () => {
    const a = await student();
    const b = await student();
    const mine = await makeInvoice(t.conn, { studentId: a.st._id });
    const theirs = await makeInvoice(t.conn, { studentId: b.st._id });
    const list = await get('/invoices', a.token).expect(200);
    expect(list.body.data.map((x: { id: string }) => x.id)).toEqual([String(mine._id)]);
    const one = await get(`/invoices/${mine._id}`, a.token).expect(200);
    expect(one.body.data).toMatchObject({ id: String(mine._id), payments: [] });
    await get(`/invoices/${theirs._id}`, a.token).expect(404);
  });

  it('FR-FEE-06: HV TRANSFERRED vẫn thấy hóa đơn lớp cũ', async () => {
    const a = await student();
    const cls = await makeClass(t.conn);
    const enr = await makeEnrollment(t.conn, { studentId: a.st._id, classId: cls._id, status: 'TRANSFERRED' });
    const inv = await makeInvoice(t.conn, { studentId: a.st._id, enrollmentId: enr._id, classId: cls._id });
    const list = await get('/invoices', a.token).expect(200);
    expect(list.body.data.map((x: { id: string }) => x.id)).toContain(String(inv._id));
    await get(`/invoices/${inv._id}`, a.token).expect(200);
  });

  it('FR-FEE-06: GV thấy HV lớp mình, response không có payments/amountPaid/discount', async () => {
    const cls = await makeClass(t.conn, { teacherId: teacher.user._id });
    const st = await makeStudent(t.conn);
    await makeEnrollment(t.conn, { studentId: st._id, classId: cls._id, status: 'ENROLLED' });
    const inv = await makeInvoice(t.conn, { studentId: st._id, classId: cls._id, amountDue: 1_000_000 });
    await makePayment(t.conn, { invoiceId: inv._id });
    const outsider = await makeInvoice(t.conn);
    const list = await get('/invoices', teacher.token).expect(200);
    const ids = list.body.data.map((x: { id: string }) => x.id);
    expect(ids).toContain(String(inv._id));
    expect(ids).not.toContain(String(outsider._id));
    for (const row of [list.body.data.find((x: { id: string }) => x.id === String(inv._id)), (await get(`/invoices/${inv._id}`, teacher.token).expect(200)).body.data]) {
      expect(row).toMatchObject({ id: String(inv._id), balance: 1_000_000 });
      for (const k of ['payments', 'amountPaid', 'discount', 'amountDue', 'finalAmount']) expect(row).not.toHaveProperty(k);
    }
  });

  it('FR-FEE-06: GV xem hóa đơn HV ngoài lớp -> 404', async () => {
    const inv = await makeInvoice(t.conn);
    await get(`/invoices/${inv._id}`, teacher.token).expect(404);
  });

  it('FR-FEE-06: M/S xem chi tiết có payments; id sai -> 404', async () => {
    const inv = await makeInvoice(t.conn);
    const p = await makePayment(t.conn, { invoiceId: inv._id });
    for (const tk of [manager.token, staff.token]) {
      const r = await get(`/invoices/${inv._id}`, tk).expect(200);
      expect(r.body.data.payments.map((x: { id: string }) => x.id)).toEqual([String(p._id)]);
    }
    await get('/invoices/not-an-id', manager.token).expect(404);
    await get(`/invoices/${new Types.ObjectId()}`, manager.token).expect(404);
  });

  it('FR-FEE-06: lọc overdue=true / status / from-to / classId / studentId', async () => {
    const st = await makeStudent(t.conn);
    const cls = await makeClass(t.conn);
    const late = await makeInvoice(t.conn, { studentId: st._id, classId: cls._id, dueDate: new Date('2026-01-04T00:00:00+07:00') });
    const today = await makeInvoice(t.conn, { studentId: st._id, dueDate: new Date('2026-01-05T00:00:00+07:00') });
    const paid = await makeInvoice(t.conn, { studentId: st._id, dueDate: new Date('2026-01-01T00:00:00+07:00'), status: 'PAID', balance: 0, amountPaid: 3_000_000 });
    const voided = await makeInvoice(t.conn, { studentId: st._id, dueDate: new Date('2026-01-01T00:00:00+07:00'), status: 'VOID' });
    const ids = async (q: string) => (await get(`/invoices?${q}`, manager.token).expect(200)).body.data.map((x: { id: string }) => x.id).sort();
    const s = String(st._id);
    expect(await ids(`studentId=${s}&overdue=true`)).toEqual([String(late._id)]);
    expect(await ids(`studentId=${s}&status=PAID`)).toEqual([String(paid._id)]);
    expect(await ids(`studentId=${s}&status=VOID`)).toEqual([String(voided._id)]);
    expect(await ids(`studentId=${s}&from=2026-01-05&to=2026-01-05`)).toEqual([String(today._id)]);
    expect(await ids(`classId=${cls._id}`)).toEqual([String(late._id)]);
    expect((await ids(`studentId=${s}`)).length).toBe(4);
    const od = await get(`/invoices?studentId=${s}`, staff.token).expect(200);
    expect(od.body.meta).toMatchObject({ total: 4 });
    expect(od.body.data.find((x: { id: string }) => x.id === String(late._id))).toMatchObject({ overdue: true, studentCode: st.code, studentName: st.fullName });
  });

  it('FR-FEE-07: POST SURCHARGE -> 201 code HD2026…, kind SURCHARGE', async () => {
    const st = await makeStudent(t.conn);
    const res = await t.http().post('/api/v1/invoices').set(auth(staff.token))
      .send({ studentId: String(st._id), description: 'Phí giáo trình', amountDue: 200_000, dueDate: '2026-01-20' }).expect(201);
    expect(res.body.data).toMatchObject({ kind: 'SURCHARGE', amountDue: 200_000, finalAmount: 200_000, balance: 200_000, amountPaid: 0, status: 'UNPAID', dueDate: '2026-01-20', description: 'Phí giáo trình', studentId: String(st._id) });
    expect(res.body.data.code).toMatch(/^HD202601\d{4}$/);
    expect(await t.conn.model(Models.AuditLog).countDocuments({ entity: 'invoice', entityId: new Types.ObjectId(res.body.data.id) })).toBe(1);
  });

  it('FR-FEE-07: SURCHARGE thiếu description -> 400; HV không tồn tại -> 404', async () => {
    const st = await makeStudent(t.conn);
    const r = await t.http().post('/api/v1/invoices').set(auth(manager.token)).send({ studentId: String(st._id), amountDue: 1000, dueDate: '2026-01-20' }).expect(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
    await t.http().post('/api/v1/invoices').set(auth(manager.token))
      .send({ studentId: String(new Types.ObjectId()), description: 'x', amountDue: 1000, dueDate: '2026-01-20' }).expect(404);
  });

  it('FR-FEE-07: receipt -> application/pdf, pdfText chứa mã PT và "1.500.000"', async () => {
    const inv = await makeInvoice(t.conn, { amountDue: 3_000_000 });
    const p = await makePayment(t.conn, { invoiceId: inv._id, amount: 1_500_000, recordedBy: staffUserId() });
    const res = await get(`/payments/${p._id}/receipt.pdf`, manager.token).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    const text = await pdfText(res.body as Buffer);
    expect(text).toContain(p.code);
    expect(text).toContain('1.500.000');
    const st = await t.conn.model(Models.Student).findById(inv.studentId).lean<{ fullName: string }>();
    expect(text).toContain(st!.fullName);
  });

  it('FR-FEE-07: receipt: HV mình 200, HV khác 404, payment không tồn tại 404; T 403', async () => {
    const a = await student();
    const b = await student();
    const inv = await makeInvoice(t.conn, { studentId: a.st._id });
    const p = await makePayment(t.conn, { invoiceId: inv._id });
    await get(`/payments/${p._id}/receipt.pdf`, a.token).expect(200);
    await get(`/payments/${p._id}/receipt.pdf`, b.token).expect(404);
    await get(`/payments/${new Types.ObjectId()}/receipt.pdf`, staff.token).expect(404);
    await get(`/payments/${p._id}/receipt.pdf`, teacher.token).expect(403);
    await get(`/payments/${p._id}/receipt.pdf`, admin.token).expect(403);
  });

  it('FR-FEE-06/07: A mọi route -> 403; T/H không tạo phụ thu', async () => {
    const inv = await makeInvoice(t.conn);
    const body = { studentId: String(inv.studentId), description: 'x', amountDue: 1000, dueDate: '2026-01-20' };
    await get('/invoices', admin.token).expect(403);
    await get(`/invoices/${inv._id}`, admin.token).expect(403);
    const h = await student();
    for (const tk of [admin.token, teacher.token, h.token]) await t.http().post('/api/v1/invoices').set(auth(tk)).send(body).expect(403);
  });
});
