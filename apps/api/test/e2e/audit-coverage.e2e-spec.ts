import { Types } from 'mongoose';
import { AttendanceStatus, ClassStatus, EnrollmentStatus, Role, SessionStatus } from '@lc/shared';
import { Models } from '../../src/database/models';
import { makeClass, makeEnrollment, makeSession } from '../factories/academic.factory';
import { makeAssessment } from '../factories/assessment.factory';
import { makeInvoice } from '../factories/billing.factory';
import { makeStudent } from '../factories/student.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

const START = new Date('2026-01-06T02:00:00Z');
const END = new Date('2026-01-06T04:00:00Z');

describe('FR-AUD-01 Audit log cho mọi thao tác ghi', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(() => t.clock.set(START));
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  interface Ctx {
    actor: { token: string; user: { _id: Types.ObjectId } };
    role: Role;
    entity: string;
    entityId: Types.ObjectId;
    call: () => Promise<{ status: number }>;
    action: string;
  }

  async function classCase(): Promise<Ctx> {
    const actor = await loginAs(t, Role.MANAGER);
    const cls = await makeClass(t.conn);
    return {
      actor, role: Role.MANAGER, entity: 'class', entityId: cls._id, action: 'update',
      call: () => t.http().patch(`/api/v1/classes/${cls._id}`).set(auth(actor.token)).send({ maxCapacity: 18 }),
    };
  }
  async function studentCase(): Promise<Ctx> {
    const actor = await loginAs(t, Role.MANAGER);
    const st = await makeStudent(t.conn);
    return {
      actor, role: Role.MANAGER, entity: 'student', entityId: st._id, action: 'update',
      call: () => t.http().patch(`/api/v1/students/${st._id}`).set(auth(actor.token)).send({ fullName: 'Tên Mới Audit' }),
    };
  }
  async function sessionUpdateCase(): Promise<Ctx> {
    const actor = await loginAs(t, Role.MANAGER);
    const s = await makeSession(t.conn, { startAt: new Date('2026-01-07T02:00:00Z'), endAt: new Date('2026-01-07T04:00:00Z') });
    return {
      actor, role: Role.MANAGER, entity: Models.Session, entityId: s._id, action: 'update',
      call: () => t.http().patch(`/api/v1/sessions/${s._id}`).set(auth(actor.token)).send({ startAt: '2026-01-07T03:00:00.000Z', endAt: '2026-01-07T05:00:00.000Z' }),
    };
  }
  async function sessionCancelCase(): Promise<Ctx> {
    const actor = await loginAs(t, Role.MANAGER);
    const s = await makeSession(t.conn, { startAt: new Date('2026-01-07T02:00:00Z'), endAt: new Date('2026-01-07T04:00:00Z') });
    return {
      actor, role: Role.MANAGER, entity: Models.Session, entityId: s._id, action: 'status',
      call: () => t.http().post(`/api/v1/sessions/${s._id}/cancel`).set(auth(actor.token)).send({ reason: 'GV bận' }),
    };
  }
  async function attendanceCase(): Promise<Ctx> {
    const teacher = await loginAs(t, Role.TEACHER);
    const cls = await makeClass(t.conn, { teacherId: teacher.user._id });
    const s = await makeSession(t.conn, { classId: cls._id, teacherId: teacher.user._id, startAt: START, endAt: END, status: SessionStatus.SCHEDULED });
    const st = await makeStudent(t.conn);
    await makeEnrollment(t.conn, {
      studentId: st._id, courseId: cls.courseId, classId: cls._id, status: EnrollmentStatus.ENROLLED,
      history: [{ from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED, at: new Date('2026-01-01T00:00:00Z') }],
    });
    return {
      actor: teacher, role: Role.TEACHER, entity: Models.Attendance, entityId: s._id, action: 'create',
      call: () => t.http().put(`/api/v1/sessions/${s._id}/attendance`).set(auth(teacher.token)).send({ records: [{ studentId: String(st._id), status: AttendanceStatus.PRESENT }] }),
    };
  }
  async function gradeCase(): Promise<Ctx> {
    const teacher = await loginAs(t, Role.TEACHER);
    const cls = await makeClass(t.conn, { teacherId: teacher.user._id, status: ClassStatus.ONGOING });
    const a = await makeAssessment(t.conn, { classId: cls._id });
    const st = await makeStudent(t.conn, { withUser: true });
    await makeEnrollment(t.conn, { studentId: st._id, classId: cls._id, courseId: cls.courseId, status: EnrollmentStatus.ENROLLED });
    return {
      actor: teacher, role: Role.TEACHER, entity: Models.Grade, entityId: a._id, action: 'update',
      call: () => t.http().put(`/api/v1/assessments/${a._id}/grades`).set(auth(teacher.token)).send({ grades: [{ studentId: String(st._id), score: 8 }], confirm: true }),
    };
  }
  async function paymentCase(): Promise<Ctx> {
    const actor = await loginAs(t, Role.ACADEMIC_STAFF);
    const inv = await makeInvoice(t.conn, { amountDue: 1_000_000 });
    return {
      actor, role: Role.ACADEMIC_STAFF, entity: 'payment', entityId: inv._id, action: 'create',
      call: () => t.http().post(`/api/v1/invoices/${inv._id}/payments`).set(auth(actor.token)).send({ amount: 400_000, method: 'CASH' }),
    };
  }
  async function discountCase(): Promise<Ctx> {
    const actor = await loginAs(t, Role.ACADEMIC_STAFF);
    const inv = await makeInvoice(t.conn, { amountDue: 1_000_000 });
    return {
      actor, role: Role.ACADEMIC_STAFF, entity: 'invoice', entityId: inv._id, action: 'update',
      call: () => t.http().post(`/api/v1/invoices/${inv._id}/discount`).set(auth(actor.token)).send({ kind: 'PERCENT', value: 10, reason: 'Anh em ruột' }),
    };
  }

  it.each([
    ['hồ sơ học viên', studentCase],
    ['lớp học', classCase],
    ['lịch: sửa buổi', sessionUpdateCase],
    ['lịch: hủy buổi', sessionCancelCase],
    ['điểm danh', attendanceCase],
    ['điểm (xác nhận)', gradeCase],
    ['học phí: thu tiền', paymentCase],
    ['học phí: giảm giá', discountCase],
  ])('FR-AUD-01 %s ghi audit_logs: actorId, actorRole, action, after', async (_name, mk) => {
    const c = await (mk as () => Promise<Ctx>)();
    const res = await c.call();
    expect(res.status).toBeLessThan(300);
    const logs = await t.conn.model(Models.AuditLog).find({ actorId: c.actor.user._id }).lean<Array<Record<string, unknown>>>();
    const hit = logs.filter((l) => l.entity === c.entity);
    expect(hit.length).toBeGreaterThanOrEqual(1);
    expect(hit.every((l) => l.actorRole === c.role && l.after != null && l.entityId)).toBe(true);
    expect(hit.some((l) => l.action === c.action)).toBe(true);
    // payment logs the new payment id; every other case logs the target itself
    const expectedId = c.entity === 'payment' ? (await t.conn.model(Models.Payment).findOne({ invoiceId: c.entityId }).lean<{ _id: Types.ObjectId }>())?._id : c.entityId;
    expect(expectedId).toBeDefined();
    expect(hit.some((l) => String(l.entityId) === String(expectedId))).toBe(true);
  });
});
