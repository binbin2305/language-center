import { Types } from 'mongoose';
import { EnrollmentStatus, InvoiceKind, InvoiceStatus } from '@lc/shared';
import { INVOICE_CREATOR, InvoiceCreator } from '../../src/common/contracts';
import { withTransaction } from '../../src/common/db/transaction';
import { FeesModule } from '../../src/modules/fees/fees.module';
import { InvoiceCreatorService } from '../../src/modules/fees/invoice-creator.service';
import { makeClass, makeCourse, makeEnrollment, makeInvoice, makeStudent, makePayment, models } from '../factories';
import { assertInvoiceInvariants } from '../factories/fees.extra';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-FEE-02 Hóa đơn học phí', () => {
  let t: TestApp;
  let creator: InvoiceCreator;
  const create = (id: Types.ObjectId) => withTransaction(t.conn, (s) => creator.createForEnrollment(id, s));
  const voidIt = (id: Types.ObjectId, reason = 'Rút khỏi khóa') => withTransaction(t.conn, (s) => creator.voidForEnrollment(id, reason, s));

  async function setup(baseFee = 3_000_000, extra: Record<string, unknown> = {}) {
    const course = await makeCourse(t.conn, { baseFee });
    const cls = await makeClass(t.conn, { courseId: course._id, startDate: new Date('2026-01-10T00:00:00+07:00') });
    const student = await makeStudent(t.conn);
    const enr = await makeEnrollment(t.conn, { studentId: student._id, courseId: course._id, classId: cls._id, ...extra });
    return { course, cls, student, enr };
  }

  beforeAll(async () => {
    t = await createTestApp();
    await models(t.conn).Invoice.syncIndexes();
    creator = t.app.select(FeesModule).get(INVOICE_CREATOR);
  });
  afterEach(async () => {
    await assertInvoiceInvariants(t.conn);
  });
  afterAll(async () => {
    await t.close();
  });

  it('resolve từ FeesModule là InvoiceCreatorService', () => {
    expect(creator).toBeInstanceOf(InvoiceCreatorService);
  });

  it('tạo -> TUITION, snapshot baseFee, dueDate = startDate + 7, mã HD202601xxxx', async () => {
    const { course, cls, enr } = await setup();
    const id = await create(enr._id);
    const inv = await models(t.conn).Invoice.findById(id).lean();
    expect(inv).toMatchObject({ kind: InvoiceKind.TUITION, amountDue: 3_000_000, finalAmount: 3_000_000, balance: 3_000_000, amountPaid: 0, status: InvoiceStatus.UNPAID });
    expect(inv?.code).toMatch(/^HD202601\d{4}$/);
    expect(inv?.dueDate).toEqual(new Date('2026-01-17T00:00:00+07:00'));
    expect(inv?.classId?.toString()).toBe(cls._id.toString());
    expect(inv?.courseId?.toString()).toBe(course._id.toString());
    expect(inv?.enrollmentId?.toString()).toBe(enr._id.toString());
    await models(t.conn).Course.updateOne({ _id: course._id }, { baseFee: 5_000_000 });
    expect((await models(t.conn).Invoice.findById(id).lean())?.amountDue).toBe(3_000_000);
  });

  it('gọi hai lần -> cùng id, một hóa đơn', async () => {
    const { enr } = await setup();
    const a = await create(enr._id);
    const b = await create(enr._id);
    expect(b?.toString()).toBe(a?.toString());
    expect(await models(t.conn).Invoice.countDocuments({ enrollmentId: enr._id })).toBe(1);
  });

  it('enrollment mới có transferredFromId -> trả hóa đơn cũ, không tạo mới', async () => {
    const { course, student, enr } = await setup();
    const id = await create(enr._id);
    await models(t.conn).Enrollment.updateOne({ _id: enr._id }, { status: EnrollmentStatus.TRANSFERRED });
    const next = await makeEnrollment(t.conn, { studentId: student._id, courseId: course._id, transferredFromId: enr._id });
    const again = await create(next._id);
    expect(again?.toString()).toBe(id?.toString());
    expect(await models(t.conn).Invoice.countDocuments({ studentId: student._id })).toBe(1);
  });

  it('theo enrollment.invoiceId của chuỗi trước (factory makeInvoice)', async () => {
    const { course, student, enr } = await setup();
    const inv = await makeInvoice(t.conn, { studentId: student._id, courseId: course._id, enrollmentId: enr._id });
    await models(t.conn).Enrollment.updateOne({ _id: enr._id }, { status: EnrollmentStatus.TRANSFERRED });
    const next = await makeEnrollment(t.conn, { studentId: student._id, courseId: course._id, transferredFromId: enr._id });
    expect((await create(next._id))?.toString()).toBe(inv._id.toString());
  });

  it('SURCHARGE thủ công cùng enrollmentId không bị unique chặn', async () => {
    const { student, enr } = await setup();
    await create(enr._id);
    await makeInvoice(t.conn, { kind: InvoiceKind.SURCHARGE, studentId: student._id, enrollmentId: enr._id });
    expect(await models(t.conn).Invoice.countDocuments({ enrollmentId: enr._id })).toBe(2);
  });

  it('void khi amountPaid 0 -> VOID, lý do nằm trong audit log', async () => {
    const { enr } = await setup();
    const id = await create(enr._id);
    await voidIt(enr._id, 'Rút khỏi khóa');
    expect((await models(t.conn).Invoice.findById(id).lean())?.status).toBe(InvoiceStatus.VOID);
    const logs = await t.conn.collection('audit_logs').find({ entity: 'invoice', entityId: id }).toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].after).toMatchObject({ status: InvoiceStatus.VOID, reason: 'Rút khỏi khóa' });
  });

  it('void khi amountPaid > 0 -> không đổi', async () => {
    const { enr } = await setup();
    const id = await create(enr._id);
    await makePayment(t.conn, { invoiceId: id!, amount: 1_000_000 });
    await models(t.conn).Invoice.updateOne({ _id: id }, { amountPaid: 1_000_000, balance: 2_000_000, status: InvoiceStatus.PARTIAL });
    await voidIt(enr._id);
    expect((await models(t.conn).Invoice.findById(id).lean())?.status).toBe(InvoiceStatus.PARTIAL);
  });

  it('baseFee 0 -> status PAID', async () => {
    const { enr } = await setup(0);
    const id = await create(enr._id);
    expect(await models(t.conn).Invoice.findById(id).lean()).toMatchObject({ status: InvoiceStatus.PAID, finalAmount: 0, balance: 0 });
  });

  it('D11 bước 1: enrollment.invoiceId được dùng dù invoice.enrollmentId khác', async () => {
    const { course, student, enr } = await setup();
    const other = await makeEnrollment(t.conn, { studentId: (await makeStudent(t.conn))._id, courseId: course._id });
    const inv = await makeInvoice(t.conn, { studentId: student._id, courseId: course._id, enrollmentId: other._id });
    await models(t.conn).Enrollment.updateOne({ _id: enr._id }, { invoiceId: inv._id, status: EnrollmentStatus.TRANSFERRED });
    const next = await makeEnrollment(t.conn, { studentId: student._id, courseId: course._id, transferredFromId: enr._id });
    expect((await create(next._id))?.toString()).toBe(inv._id.toString());
    expect(await models(t.conn).Invoice.countDocuments({ studentId: student._id })).toBe(1);
  });

  it('void qua enrollment kế nhiệm (transferredFromId) -> VOID hóa đơn của chuỗi', async () => {
    const { course, student, enr } = await setup();
    const id = await create(enr._id);
    await models(t.conn).Enrollment.updateOne({ _id: enr._id }, { status: EnrollmentStatus.TRANSFERRED });
    const next = await makeEnrollment(t.conn, { studentId: student._id, courseId: course._id, transferredFromId: enr._id });
    await voidIt(next._id);
    expect((await models(t.conn).Invoice.findById(id).lean())?.status).toBe(InvoiceStatus.VOID);
  });

  it('void hóa đơn đã VOID -> không đổi, không thêm audit', async () => {
    const { enr } = await setup();
    const id = await create(enr._id);
    await voidIt(enr._id);
    await voidIt(enr._id, 'lần hai');
    expect(await t.conn.collection('audit_logs').countDocuments({ entity: 'invoice', entityId: id })).toBe(1);
  });

  it('E11000: lookup đầu bỏ sót hóa đơn có sẵn -> retry trả id của người thắng, còn đúng một TUITION', async () => {
    const { enr } = await setup();
    const winner = await create(enr._id);
    const svc = creator as unknown as { findChainInvoice: (...a: unknown[]) => Promise<unknown> };
    const orig = svc.findChainInvoice.bind(svc);
    const spy = jest.spyOn(svc, 'findChainInvoice').mockImplementationOnce(async () => null);
    const again = await create(enr._id);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(orig).toBeDefined();
    expect(again?.toString()).toBe(winner?.toString());
    expect(await models(t.conn).Invoice.countDocuments({ enrollmentId: enr._id, kind: InvoiceKind.TUITION })).toBe(1);
    spy.mockRestore();
  });

  it('enrollment không tồn tại -> null', async () => {
    expect(await create(new Types.ObjectId())).toBeNull();
  });

  it('khóa học không tồn tại -> null, không tạo hóa đơn', async () => {
    const { enr } = await setup();
    await models(t.conn).Enrollment.updateOne({ _id: enr._id }, { courseId: new Types.ObjectId() });
    expect(await create(enr._id)).toBeNull();
    expect(await models(t.conn).Invoice.countDocuments({ enrollmentId: enr._id })).toBe(0);
  });
});
