import { Types } from 'mongoose';
import { EnrollmentStatus, ErrorCode, Role } from '@lc/shared';
import { AuthUser } from '../../src/common/auth/auth-user';
import { EnrollmentsService } from '../../src/modules/enrollments/enrollments.service';
import { INVOICE_CREATOR } from '../../src/common/contracts';
import { makeCourse, makeEnrollment, makeStudent, models } from '../factories';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-ADM-05 EnrollmentsService.createPending', () => {
  let t: TestApp;
  let svc: EnrollmentsService;
  const actor: AuthUser = { id: new Types.ObjectId(), role: Role.ADMIN };
  beforeAll(async () => {
    t = await createTestApp();
    await models(t.conn).Enrollment.syncIndexes();
    svc = t.app.get(EnrollmentsService);
  });
  afterAll(async () => {
    await t.close();
  });

  it('tạo enrollment PENDING_PLACEMENT với history đầu tiên', async () => {
    const s = await makeStudent(t.conn);
    const c = await makeCourse(t.conn);
    const e = await svc.createPending(s._id, c._id, actor);
    expect(e.status).toBe(EnrollmentStatus.PENDING_PLACEMENT);
    expect(e.history).toHaveLength(1);
    expect(e.history[0]).toMatchObject({ from: null, to: 'PENDING_PLACEMENT' });
    expect(e.history[0].by?.toString()).toBe(actor.id.toString());
    expect(e.history[0].at).toEqual(t.clock.now());
    expect(await t.conn.collection('audit_logs').countDocuments({ entity: 'enrollment', entityId: e._id })).toBe(1);
  });

  it('lần hai cùng HV + khóa -> ENROLLMENT_EXISTS', async () => {
    const s = await makeStudent(t.conn);
    const c = await makeCourse(t.conn);
    await svc.createPending(s._id, c._id, actor);
    await expect(svc.createPending(s._id, c._id, actor)).rejects.toMatchObject({ code: ErrorCode.ENROLLMENT_EXISTS });
  });

  it('enrollment cũ CANCELLED thì tạo được', async () => {
    const s = await makeStudent(t.conn);
    const c = await makeCourse(t.conn);
    await makeEnrollment(t.conn, { studentId: s._id, courseId: c._id, status: EnrollmentStatus.CANCELLED });
    const e = await svc.createPending(s._id, c._id, actor);
    expect(e.status).toBe(EnrollmentStatus.PENDING_PLACEMENT);
  });

  it('hai lệnh đồng thời cùng cặp: chỉ một thành công', async () => {
    const s = await makeStudent(t.conn);
    const c = await makeCourse(t.conn);
    const results = await Promise.allSettled([
      svc.createPending(s._id, c._id, actor),
      svc.createPending(s._id, c._id, actor),
      svc.createPending(s._id, c._id, actor),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results.filter((x) => x.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: ErrorCode.ENROLLMENT_EXISTS });
    }
    expect(await models(t.conn).Enrollment.countDocuments({ studentId: s._id, courseId: c._id })).toBe(1);
  });

  it('cung cấp INVOICE_CREATOR no-op', async () => {
    const ic = t.app.get(INVOICE_CREATOR, { strict: false });
    await expect(ic.createForEnrollment(new Types.ObjectId(), undefined as never)).resolves.toBeNull();
  });
});
