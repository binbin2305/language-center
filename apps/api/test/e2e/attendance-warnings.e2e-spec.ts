import { Types } from 'mongoose';
import { AttendanceStatus, EnrollmentStatus, NotificationType, Role, UserStatus } from '@lc/shared';
import { makeClass, makeEnrollment, makeSession } from '../factories/academic.factory';
import { makeUser } from '../factories/user.factory';
import { makeStudent } from '../factories/student.factory';
import { loginAs, signTestToken } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { AttendanceStatsService } from '../../src/modules/attendance/attendance-stats.service';
import { NotificationsService } from '../../src/common/notifications/notifications.service';
import { Models } from '../../src/database/models';

const DAY = 24 * 3_600_000;
const START0 = new Date('2026-01-06T02:00:00Z');

describe('FR-ATT-05 Cảnh báo vắng', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (req: import('supertest').Test, token: string) => req.set('Authorization', `Bearer ${token}`);
  const warnings = (classId: unknown) => t.conn.model(Models.AttendanceWarning).find({ classId }).lean();
  const notifs = (studentId: unknown) =>
    t.conn.model(Models.Notification).find({ type: NotificationType.ATTENDANCE_WARNING, refId: studentId }).lean();

  async function seed(nSessions: number) {
    const staff = await loginAs(t, Role.ACADEMIC_STAFF);
    const cls = await makeClass(t.conn);
    const st = await makeStudent(t.conn, { withUser: true });
    await makeEnrollment(t.conn, {
      studentId: st._id,
      courseId: cls.courseId,
      classId: cls._id,
      status: EnrollmentStatus.ENROLLED,
      history: [{ from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED, at: new Date('2026-01-01T00:00:00Z') }],
    });
    const sessions: Awaited<ReturnType<typeof makeSession>>[] = [];
    for (let i = 0; i < nSessions; i++) {
      const startAt = new Date(START0.getTime() + i * DAY);
      sessions.push(await makeSession(t.conn, { classId: cls._id, startAt, endAt: new Date(startAt.getTime() + 2 * 3_600_000) }));
    }
    const tok = () => signTestToken(t, { sub: String(staff.user._id), role: Role.ACADEMIC_STAFF });
    const take = async (i: number, status: AttendanceStatus) => {
      t.clock.set(sessions[i]!.startAt);
      const r = await auth(t.http().put(`/api/v1/sessions/${sessions[i]!._id}/attendance`), tok()).send({
        records: [{ studentId: String(st._id), status }],
      });
      expect(r.status).toBe(200);
    };
    const patch = async (i: number, status: AttendanceStatus) => {
      t.clock.set(sessions[i]!.startAt);
      const r = await auth(t.http().patch(`/api/v1/sessions/${sessions[i]!._id}/attendance`), tok()).send({
        records: [{ studentId: String(st._id), status }],
      });
      expect(r.status).toBe(200);
    };
    return { staff, cls, st, sessions, take, patch };
  }

  it('FR-ATT-05 threshold 0.2: HV vắng 1/4 buổi lần đầu → 1 warning + thông báo tới HV và mọi ACADEMIC_STAFF ACTIVE (không MANAGER, không S DISABLED)', async () => {
    const manager = await makeUser(t.conn, { role: Role.MANAGER });
    const disabled = await makeUser(t.conn, { role: Role.ACADEMIC_STAFF, status: UserStatus.DISABLED });
    const s = await seed(4);
    for (let i = 0; i < 3; i++) await s.take(i, AttendanceStatus.PRESENT);
    expect(await warnings(s.cls._id)).toHaveLength(0);
    await s.take(3, AttendanceStatus.UNEXCUSED);
    const w = await warnings(s.cls._id);
    expect(w).toHaveLength(1);
    expect(w[0]!.absenceRate).toBeCloseTo(0.25);
    const ns = await notifs(s.st._id);
    const got = ns.map((n) => String(n.userId)).sort();
    const activeStaff = await t.conn.model(Models.User).find({ role: Role.ACADEMIC_STAFF, status: UserStatus.ACTIVE }).lean();
    const expected = [String(s.st.userId), ...activeStaff.map((u) => String(u._id))].sort();
    expect(got).toEqual(expected);
    expect(got).not.toContain(String(manager._id));
    expect(got).not.toContain(String(disabled._id));
    expect(ns.every((n) => n.refType === 'STUDENT')).toBe(true);
  });

  it('FR-ATT-05 buổi tiếp vẫn vượt → không thông báo lại', async () => {
    const s = await seed(5);
    for (let i = 0; i < 3; i++) await s.take(i, AttendanceStatus.PRESENT);
    await s.take(3, AttendanceStatus.UNEXCUSED);
    const before = (await notifs(s.st._id)).length;
    expect(before).toBeGreaterThan(0);
    await s.take(4, AttendanceStatus.UNEXCUSED);
    expect((await notifs(s.st._id)).length).toBe(before);
    expect(await warnings(s.cls._id)).toHaveLength(1);
  });

  it('FR-ATT-05 PATCH về có mặt → ≤ ngưỡng → warning bị xóa; vượt lại → thông báo lần nữa', async () => {
    const s = await seed(4);
    for (let i = 0; i < 3; i++) await s.take(i, AttendanceStatus.PRESENT);
    await s.take(3, AttendanceStatus.UNEXCUSED);
    const first = (await notifs(s.st._id)).length;
    await s.patch(3, AttendanceStatus.PRESENT);
    expect(await warnings(s.cls._id)).toHaveLength(0);
    expect((await notifs(s.st._id)).length).toBe(first);
    await s.patch(3, AttendanceStatus.UNEXCUSED);
    expect(await warnings(s.cls._id)).toHaveLength(1);
    expect((await notifs(s.st._id)).length).toBe(first * 2);
  });

  it('FR-ATT-05 đúng bằng ngưỡng (1/5 = 0.2) → không cảnh báo', async () => {
    const s = await seed(5);
    for (let i = 0; i < 4; i++) await s.take(i, AttendanceStatus.PRESENT);
    await s.take(4, AttendanceStatus.UNEXCUSED);
    expect(await warnings(s.cls._id)).toHaveLength(0);
    expect(await notifs(s.st._id)).toHaveLength(0);
  });

  it('FR-ATT-05 warningFlags(classId) trả absenceRate và warning đúng cho từng HV', async () => {
    const s = await seed(5);
    for (let i = 0; i < 4; i++) await s.take(i, AttendanceStatus.PRESENT);
    await s.take(4, AttendanceStatus.UNEXCUSED);
    const stats = t.app.get(AttendanceStatsService);
    let flags = await stats.warningFlags(s.cls._id);
    expect(flags.get(String(s.st._id))).toEqual({ absenceRate: 0.2, warning: false });
    await s.patch(3, AttendanceStatus.UNEXCUSED);
    flags = await stats.warningFlags(s.cls._id);
    expect(flags.get(String(s.st._id))).toEqual({ absenceRate: 0.4, warning: true });
    expect((await stats.warningFlags(new Types.ObjectId())).size).toBe(0);
  });

  it('FR-ATT-05 GET /sessions/:id/attendance roster[].absenceRate đúng', async () => {
    const s = await seed(4);
    for (let i = 0; i < 3; i++) await s.take(i, AttendanceStatus.PRESENT);
    await s.take(3, AttendanceStatus.UNEXCUSED);
    const res = await auth(t.http().get(`/api/v1/sessions/${s.sessions[3]!._id}/attendance`), signTestToken(t, { sub: String(s.staff.user._id), role: Role.ACADEMIC_STAFF }));
    expect(res.status).toBe(200);
    expect(res.body.data.roster[0].absenceRate).toBeCloseTo(0.25);
  });

  it('FR-ATT-05 notify lỗi sau khi insert warning → xóa warning, lần lưu sau thử lại và thông báo được gửi', async () => {
    const s = await seed(5);
    for (let i = 0; i < 3; i++) await s.take(i, AttendanceStatus.PRESENT);
    const notifier = t.app.get(NotificationsService);
    const spy = jest.spyOn(notifier, 'notify').mockRejectedValueOnce(new Error('boom'));
    await s.take(3, AttendanceStatus.UNEXCUSED);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await warnings(s.cls._id)).toHaveLength(0);
    spy.mockRestore();
    await s.patch(3, AttendanceStatus.UNEXCUSED);
    await s.take(4, AttendanceStatus.UNEXCUSED);
    expect(await warnings(s.cls._id)).toHaveLength(1);
    expect((await notifs(s.st._id)).length).toBeGreaterThan(0);
  });
});
