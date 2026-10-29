import { Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import {
  makeAssessment,
  makeClass,
  makeEnrollment,
  makeGrade,
  makeInvoice,
  makeSession,
  makeStudent,
} from '../factories';
import { Models } from '../../src/database/models';
import { AuditLog } from '../../src/database/schemas/audit-log.schema';

describe('FR-CLS-04 Xóa / ngừng lớp', () => {
  let t: TestApp;
  let manager: { token: string };
  let staff: { token: string };

  beforeAll(async () => {
    t = await createTestApp();
    manager = await loginAs(t, Role.MANAGER);
    staff = await loginAs(t, Role.ACADEMIC_STAFF);
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const del = (id: unknown, token = manager.token) =>
    t.http().delete(`/api/v1/classes/${String(id)}`).set(auth(token));
  const reasonsOf = async (id: unknown) => {
    const res = await del(id).expect(422);
    expect(res.body.error.code).toBe('CLASS_HAS_DEPENDENCIES');
    return res.body.error.details.reasons as string[];
  };

  it('FR-CLS-04: lớp trống → 204, GET → 404, ghi audit delete', async () => {
    const c = await makeClass(t.conn);
    await del(c._id, staff.token).expect(204);
    await t.http().get(`/api/v1/classes/${c._id}`).set(auth(manager.token)).expect(404);
    const log = await t.conn
      .model<AuditLog>(Models.AuditLog)
      .findOne({ entity: 'class', entityId: c._id, action: 'delete' });
    expect(log).not.toBeNull();
  });

  it('FR-CLS-04: lớp không tồn tại → 404', async () => {
    await del('64b000000000000000000000').expect(404);
    await del('abc').expect(404);
  });

  it('FR-CLS-04: có enrollment ENROLLED → ACTIVE_STUDENTS, lớp còn nguyên', async () => {
    const c = await makeClass(t.conn);
    await makeEnrollment(t.conn, { classId: c._id, status: 'ENROLLED' });
    expect(await reasonsOf(c._id)).toContain('ACTIVE_STUDENTS');
    await t.http().get(`/api/v1/classes/${c._id}`).set(auth(manager.token)).expect(200);
  });

  it('FR-CLS-04: chỉ enrollment TRANSFERRED → [ENROLLMENT_HISTORY]', async () => {
    const c = await makeClass(t.conn);
    await makeEnrollment(t.conn, { classId: c._id, status: 'TRANSFERRED' });
    expect(await reasonsOf(c._id)).toEqual(['ENROLLMENT_HISTORY']);
  });

  it('FR-CLS-04: có session → [SESSIONS]', async () => {
    const c = await makeClass(t.conn);
    await makeSession(t.conn, {
      classId: c._id,
      startAt: new Date('2026-02-02T11:00:00Z'),
      endAt: new Date('2026-02-02T12:30:00Z'),
      teacherId: c.teacherId,
    });
    expect(await reasonsOf(c._id)).toEqual(['SESSIONS']);
  });

  it('FR-CLS-04: có grade qua assessment của lớp → GRADES', async () => {
    const c = await makeClass(t.conn);
    const a = await makeAssessment(t.conn, { classId: c._id });
    const g = await makeGrade(t.conn, { assessmentId: a._id });
    await t.conn.model(Models.Enrollment).deleteOne({ _id: g.enrollmentId });
    expect(await reasonsOf(c._id)).toEqual(['GRADES']);
  });

  it('FR-CLS-04: có invoice classId → [INVOICES]', async () => {
    const c = await makeClass(t.conn);
    await makeInvoice(t.conn, { kind: 'SURCHARGE', classId: c._id });
    expect(await reasonsOf(c._id)).toEqual(['INVOICES']);
  });

  it('FR-CLS-04: nhiều loại phụ thuộc → đủ lý do', async () => {
    const c = await makeClass(t.conn);
    const student = await makeStudent(t.conn);
    await makeEnrollment(t.conn, { classId: c._id, studentId: student._id, status: 'ENROLLED' });
    await makeEnrollment(t.conn, { classId: c._id, status: 'TRANSFERRED' });
    await makeSession(t.conn, {
      classId: c._id,
      startAt: new Date('2026-02-03T11:00:00Z'),
      endAt: new Date('2026-02-03T12:30:00Z'),
      teacherId: c.teacherId,
    });
    await makeInvoice(t.conn, { kind: 'SURCHARGE', classId: c._id });
    expect((await reasonsOf(c._id)).sort()).toEqual(
      ['ACTIVE_STUDENTS', 'ENROLLMENT_HISTORY', 'INVOICES', 'SESSIONS'].sort(),
    );
  });

  describe('deactivate', () => {
    it('FR-CLS-04: PLANNED → INACTIVE', async () => {
      const c = await makeClass(t.conn);
      const res = await t
        .http()
        .post(`/api/v1/classes/${c._id}/deactivate`)
        .set(auth(staff.token))
        .expect(200);
      expect(res.body.data.status).toBe('INACTIVE');
    });

    it('FR-CLS-04: FINISHED → 422 INVALID_STATUS_TRANSITION', async () => {
      const c = await makeClass(t.conn, { status: 'FINISHED' });
      const res = await t
        .http()
        .post(`/api/v1/classes/${c._id}/deactivate`)
        .set(auth(manager.token))
        .expect(422);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  it('FR-CLS-04: giáo viên và học viên → 403 trên DELETE và deactivate', async () => {
    const c = await makeClass(t.conn);
    for (const role of [Role.TEACHER, Role.STUDENT]) {
      const u = await loginAs(t, role);
      await del(c._id, u.token).expect(403);
      await t
        .http()
        .post(`/api/v1/classes/${c._id}/deactivate`)
        .set(auth(u.token))
        .expect(403);
    }
  });
});
