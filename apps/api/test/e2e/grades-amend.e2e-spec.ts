import { ClassStatus, EnrollmentStatus, ErrorCode, Role } from '@lc/shared';
import { SettingsService } from '../../src/common/settings/settings.service';
import { makeClass, makeEnrollment } from '../factories/academic.factory';
import { makeAssessment, makeGrade } from '../factories/assessment.factory';
import { makeStudent } from '../factories/student.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, DEFAULT_NOW, TestApp } from '../helpers/test-app';

describe('FR-GRD-04 Sửa điểm & khóa bảng điểm', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
    await t.conn.model('Settings').updateOne({ _id: 'center' }, { gradeLockDays: 14 }, { upsert: true });
    (t.app.get(SettingsService) as unknown as { cache: null }).cache = null;
  });
  afterAll(async () => {
    await t.close();
  });
  afterEach(() => t.clock.set(DEFAULT_NOW));

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const patch = (aid: unknown, sid: unknown, token: string, body: object) =>
    t.http().patch(`/api/v1/assessments/${aid}/grades/${sid}`).set(auth(token)).send(body);
  const put = (aid: unknown, token: string, body: object) =>
    t.http().put(`/api/v1/assessments/${aid}/grades`).set(auth(token)).send(body);
  const unlock = (aid: unknown, token: string, body: object) =>
    t.http().post(`/api/v1/assessments/${aid}/unlock`).set(auth(token)).send(body);

  async function setup(confirmed = true) {
    const teacher = await loginAs(t, Role.TEACHER);
    const cls = await makeClass(t.conn, { teacherId: teacher.user._id, status: ClassStatus.ONGOING });
    const a = await makeAssessment(t.conn, {
      classId: cls._id,
      heldOn: new Date('2026-01-05T00:00:00+07:00'),
      confirmedAt: confirmed ? new Date('2026-01-05T03:00:00Z') : null,
    });
    const st = await makeStudent(t.conn, { withUser: true });
    const en = await makeEnrollment(t.conn, { studentId: st._id, classId: cls._id, courseId: cls.courseId, status: EnrollmentStatus.ENROLLED });
    const g = await makeGrade(t.conn, { assessmentId: a._id, studentId: st._id, enrollmentId: en._id, score: 6, isDraft: !confirmed });
    return { teacher, cls, a, st, g };
  }

  it('FR-GRD-04 sửa thiếu lý do (rỗng/khoảng trắng) -> 400 REASON_REQUIRED', async () => {
    const { teacher, a, st } = await setup();
    for (const reason of ['', '   ']) {
      const r = await patch(a._id, st._id, teacher.token, { score: 7, reason });
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe(ErrorCode.REASON_REQUIRED);
    }
  });

  it('FR-GRD-04 có lý do -> 200, history + audit cùng transaction', async () => {
    const { teacher, a, st, g } = await setup();
    const r = await patch(a._id, st._id, teacher.token, { score: 8.5, comment: 'ok', reason: 'Chấm nhầm' });
    expect(r.status).toBe(200);
    expect(r.body.data.score).toBe(8.5);
    expect(r.body.data.history).toHaveLength(1);
    expect(r.body.data.history[0]).toMatchObject({ fromScore: 6, toScore: 8.5, toComment: 'ok', reason: 'Chấm nhầm', by: String(teacher.user._id) });
    const audit = await t.conn.model('AuditLog').find({ entity: 'grade', entityId: g._id }).lean();
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it('FR-GRD-04 chưa confirm -> 422 INVALID_STATUS_TRANSITION', async () => {
    const { teacher, a, st } = await setup(false);
    const r = await patch(a._id, st._id, teacher.token, { score: 7, reason: 'x' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
  });

  it('FR-GRD-04 HV chưa có điểm -> 404; điểm ngoài khoảng -> 400 SCORE_OUT_OF_RANGE', async () => {
    const { teacher, a, st } = await setup();
    const other = await makeStudent(t.conn);
    expect((await patch(a._id, other._id, teacher.token, { score: 7, reason: 'x' })).status).toBe(404);
    const r = await patch(a._id, st._id, teacher.token, { score: 10.25, reason: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe(ErrorCode.SCORE_OUT_OF_RANGE);
  });

  it('FR-GRD-04 biên khóa: 23:59 VN 18/01 -> 200; 00:00 VN 19/01 -> 422 GRADEBOOK_LOCKED', async () => {
    const { a, st } = await setup();
    t.clock.set(new Date('2026-01-18T16:59:00Z'));
    const fresh = async () => {
      const u = await loginAs(t, Role.TEACHER);
      await t.conn.model('Class').updateOne({ _id: a.classId }, { teacherId: u.user._id });
      return u.token;
    };
    expect((await patch(a._id, st._id, await fresh(), { score: 7, reason: 'x' })).status).toBe(200);
    t.clock.set(new Date('2026-01-18T17:00:00Z'));
    const r = await patch(a._id, st._id, await fresh(), { score: 8, reason: 'x' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe(ErrorCode.GRADEBOOK_LOCKED);
  });

  it('FR-GRD-04 PUT nháp khi khóa -> 422 GRADEBOOK_LOCKED', async () => {
    const { a, st, cls } = await setup(false);
    t.clock.set(new Date('2026-01-18T17:00:00Z'));
    const u = await loginAs(t, Role.TEACHER);
    await t.conn.model('Class').updateOne({ _id: cls._id }, { teacherId: u.user._id });
    const r = await put(a._id, u.token, { grades: [{ studentId: String(st._id), score: 5 }] });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe(ErrorCode.GRADEBOOK_LOCKED);
  });

  it('FR-GRD-04 M unlock until 25/01 -> sửa được; qua until -> 422', async () => {
    const { a, st, cls } = await setup();
    t.clock.set(new Date('2026-01-18T17:00:00Z'));
    const mgr = await loginAs(t, Role.MANAGER);
    const u = await unlock(a._id, mgr.token, { until: '2026-01-25T00:00:00.000Z' });
    expect(u.status).toBe(200);
    expect(u.body.data.unlockedUntil).toBe('2026-01-25T00:00:00.000Z');
    expect(u.body.data.isLocked).toBe(false);
    const teacher = await loginAs(t, Role.TEACHER);
    await t.conn.model('Class').updateOne({ _id: cls._id }, { teacherId: teacher.user._id });
    expect((await patch(a._id, st._id, teacher.token, { score: 9, reason: 'mở khóa' })).status).toBe(200);
    t.clock.set(new Date('2026-01-25T00:01:00Z'));
    const t2 = await loginAs(t, Role.TEACHER);
    await t.conn.model('Class').updateOne({ _id: cls._id }, { teacherId: t2.user._id });
    const r = await patch(a._id, st._id, t2.token, { score: 4, reason: 'x' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe(ErrorCode.GRADEBOOK_LOCKED);
  });

  it('FR-GRD-04 unlock until quá khứ -> 400 fields.until; assessment lạ -> 404', async () => {
    const { a } = await setup();
    const mgr = await loginAs(t, Role.MANAGER);
    const r = await unlock(a._id, mgr.token, { until: '2026-01-04T00:00:00.000Z' });
    expect(r.status).toBe(400);
    expect(r.body.error.details.fields.until).toBeDefined();
    expect((await unlock('64b000000000000000000000', mgr.token, { until: '2026-02-01T00:00:00.000Z' })).status).toBe(404);
  });

  it.each([Role.STUDENT, Role.TEACHER, Role.ACADEMIC_STAFF, Role.ADMIN])('FR-GRD-04 %s unlock -> 403', async (role) => {
    const { a } = await setup();
    const u = await loginAs(t, role);
    expect((await unlock(a._id, u.token, { until: '2026-02-01T00:00:00.000Z' })).status).toBe(403);
  });

  it.each([Role.STUDENT, Role.MANAGER, Role.ACADEMIC_STAFF, Role.ADMIN])('FR-GRD-04 %s PATCH grade -> 403', async (role) => {
    const { a, st } = await setup();
    const u = await loginAs(t, role);
    expect((await patch(a._id, st._id, u.token, { score: 7, reason: 'x' })).status).toBe(403);
  });

  it('FR-GRD-04 GV không thuộc lớp PATCH -> 404', async () => {
    const { a, st } = await setup();
    const other = await loginAs(t, Role.TEACHER);
    expect((await patch(a._id, st._id, other.token, { score: 7, reason: 'x' })).status).toBe(404);
  });
});
