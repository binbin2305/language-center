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

  it('void khi amountPaid 0 -> VOID kèm lý do', async () => {
    const { enr } = await setup();
    const id = await create(enr._id);
    await voidIt(enr._id, 'Rút khỏi khóa');
    const inv = await models(t.conn).Invoice.findById(id).lean<{ status: string; voidReason?: string }>();
    expect(inv?.status).toBe(InvoiceStatus.VOID);
    expect(inv?.voidReason).toBe('Rút khỏi khóa');
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
});
