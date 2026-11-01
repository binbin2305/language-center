import {
  AttendanceStatus,
  ClassStatus,
  EnrollmentStatus,
  InvoiceStatus,
  PlacementStatus,
  Role,
  SessionStatus,
  addVnDays,
  startOfVnDay,
  vnDay,
} from '@lc/shared';
import { Connection } from 'mongoose';
import { DEMO_PASSWORD, DEMO_TODAY, runSeedDemo } from '../../scripts/seed-demo';
import { runSeedLarge } from '../../scripts/seed-large';
import { overdueFilter } from '../../src/modules/fees/fees.mapper';
import { makeUser, models } from '../factories';
import { assertInvoiceInvariants } from '../factories/fees.extra';
import { createTestApp, TestApp } from '../helpers/test-app';

/** Monday of the VN week containing `d` (YYYY-MM-DD). */
function weekOf(d: Date): string {
  const day = vnDay(d);
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addVnDays(day, -((wd + 6) % 7));
}

async function snapshot(conn: Connection) {
  const m = models(conn);
  const roles: Record<string, number> = {};
  for (const r of Object.values(Role)) roles[r] = await m.User.countDocuments({ role: r });
  const classStatuses = (await m.Class.find({}, { status: 1 }).lean()).map((c) => c.status).sort();
  return {
    roles,
    students: await m.Student.countDocuments(),
    codes: (await m.Student.find({}, { code: 1 }).sort({ code: 1 }).lean()).map((s) => s.code),
    courses: await m.Course.countDocuments(),
    rooms: await m.Room.countDocuments(),
    classStatuses,
    enrollments: await m.Enrollment.countDocuments(),
    sessions: await m.Session.countDocuments(),
    attendance: await m.Attendance.countDocuments(),
    invoices: await m.Invoice.countDocuments(),
    payments: await m.Payment.countDocuments(),
  };
}

/** R22: every seated enrollment lists its class in classHistory and has a class-stamped ENROLLED entry. */
async function assertSeatedHistory(conn: Connection): Promise<number> {
  const seated = await models(conn).Enrollment.find({ classId: { $ne: null } }).lean();
  for (const e of seated) {
    const label = `enrollment ${e._id.toString()}`;
    expect({ label, ok: e.classHistory.some((c) => c.equals(e.classId!)) }).toEqual({ label, ok: true });
    const stamped = e.history.some((h) => h.to === EnrollmentStatus.ENROLLED && !!h.classId && h.classId.equals(e.classId!));
    expect({ label, stamped }).toEqual({ label, stamped: true });
  }
  return seated.length;
}

describe('seed:demo qua service thật + seed:large (W3-L3, D28)', () => {
  let t: TestApp;
  const m = () => models(t.conn);
  const today = startOfVnDay(DEMO_TODAY);
  const login = (username: string) => t.http().post('/api/v1/auth/login').send({ username, password: DEMO_PASSWORD });

  beforeAll(async () => {
    t = await createTestApp();
    await runSeedDemo(t.app, { clock: t.clock });
  }, 600_000);
  afterAll(async () => {
    await t.close();
  });

  it('BACKEND_SCHEMA §4: đủ số lượng (1 ADMIN, 1 MANAGER, 2 S, 5 T, 60 HV, 3 khóa, 6 phòng, 8 lớp đủ trạng thái)', async () => {
    const s = await snapshot(t.conn);
    expect(s.roles).toEqual({ ADMIN: 1, MANAGER: 1, ACADEMIC_STAFF: 2, TEACHER: 5, STUDENT: 60 });
    expect(s.students).toBe(60);
    expect(s.codes[0]).toBe('HV202600001');
    expect(s.codes[59]).toBe('HV202600060');
    expect(s.courses).toBe(3);
    expect(s.rooms).toBe(6);
    expect(s.classStatuses).toHaveLength(8);
    expect(new Set(s.classStatuses)).toEqual(new Set(Object.values(ClassStatus)));
    // Waiting / pending enrollments and a scheduled placement test with the pending candidates.
    expect(await m().Enrollment.countDocuments({ status: EnrollmentStatus.WAITING_CLASS })).toBeGreaterThan(0);
    const pending = await m().Enrollment.find({ status: EnrollmentStatus.PENDING_PLACEMENT }).lean();
    expect(pending.length).toBeGreaterThan(0);
    const test = await m().PlacementTest.findOne({ status: PlacementStatus.SCHEDULED }).lean();
    expect(test?.candidates.length).toBeGreaterThan(0);
    expect(test!.startAt.getTime()).toBeGreaterThan(t.clock.now().getTime());
    // Every student went through a lead (convert), every enrollment of a FINISHED class is COMPLETED.
    expect(await m().Student.countDocuments({ leadId: { $type: 'objectId' } })).toBe(60);
    const finished = await m().Class.findOne({ status: ClassStatus.FINISHED }).lean();
    const fin = await m().Enrollment.find({ classId: finished!._id }).lean();
    expect(fin.length).toBeGreaterThan(0);
    expect(fin.every((e) => e.status === EnrollmentStatus.COMPLETED)).toBe(true);
    // The clock is left at the demo "today".
    expect(vnDay(t.clock.now())).toBe(DEMO_TODAY);
  });

  it('R22: mọi enrollment có classId thì classHistory chứa classId và mục history to ENROLLED có classId', async () => {
    expect(await assertSeatedHistory(t.conn)).toBeGreaterThanOrEqual(40);
  });

  it('FR-FEE: hóa đơn có đủ UNPAID/PARTIAL/PAID/quá hạn và assertInvoiceInvariants xanh', async () => {
    const statuses = new Set((await m().Invoice.find({}, { status: 1 }).lean()).map((i) => i.status));
    for (const st of [InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL, InvoiceStatus.PAID]) expect(statuses).toContain(st);
    expect(await m().Invoice.countDocuments(overdueFilter(t.clock.now()))).toBeGreaterThan(0);
    // An unpaid invoice that is not yet due exists too (class not started).
    expect(await m().Invoice.countDocuments({ status: InvoiceStatus.UNPAID, dueDate: { $gte: today } })).toBeGreaterThan(0);
    // Every seated enrollment has its TUITION invoice (InvoiceCreator), linked back.
    const seated = await m().Enrollment.find({ classId: { $ne: null } }).lean();
    expect(seated.every((e) => !!e.invoiceId)).toBe(true);
    await assertInvoiceInvariants(t.conn);
  });

  it('FR-ATT/FR-GRD: có điểm danh 4 tuần đã qua, lịch 8 tuần, 2 bài đánh giá đã confirm mỗi lớp đang học', async () => {
    const ongoing = await m().Class.find({ status: ClassStatus.ONGOING }).lean();
    expect(ongoing.length).toBeGreaterThanOrEqual(4);
    for (const c of ongoing) {
      const sessions = await m().Session.find({ classId: c._id }).lean();
      expect(new Set(sessions.map((s) => weekOf(s.startAt))).size).toBe(8);
      const taken = sessions.filter((s) => s.attendanceTakenAt);
      expect(new Set(taken.map((s) => weekOf(s.startAt))).size).toBe(4);
      expect(taken.every((s) => s.startAt < t.clock.now())).toBe(true);
      // Every past, non-cancelled session has attendance for the whole roster.
      const past = sessions.filter((s) => s.startAt < today && s.status === SessionStatus.SCHEDULED);
      expect(past.every((s) => !!s.attendanceTakenAt)).toBe(true);
      const roster = await m().Enrollment.countDocuments({ classId: c._id, status: EnrollmentStatus.ENROLLED });
      expect(roster).toBeGreaterThan(0);
      for (const s of taken) expect(await m().Attendance.countDocuments({ sessionId: s._id })).toBe(roster);

      const confirmed = await m().Assessment.find({ classId: c._id, confirmedAt: { $ne: null } }).lean();
      expect(confirmed).toHaveLength(2);
      for (const a of confirmed) {
        expect(await m().Grade.countDocuments({ assessmentId: a._id, isDraft: false, score: { $ne: null } })).toBe(roster);
      }
    }
    const statuses = new Set((await m().Attendance.find({}, { status: 1 }).lean()).map((a) => a.status));
    expect(statuses).toContain(AttendanceStatus.PRESENT);
    expect(statuses).toContain(AttendanceStatus.UNEXCUSED);
    expect(await m().Session.countDocuments({ status: SessionStatus.CANCELLED })).toBeGreaterThan(0);
    // Sessions today exist for the dashboard.
    expect(await m().Session.countDocuments({ startAt: { $gte: today, $lt: startOfVnDay(addVnDays(DEMO_TODAY, 1)) } })).toBeGreaterThan(0);
  });

  it('FR-GRD-01: có bài đánh giá chưa confirm đã tới hạn (heldOn ≤ demo today) ở lớp đang học → GV thấy "Bài cần nhập điểm"', async () => {
    const ongoing = await m().Class.find({ status: ClassStatus.ONGOING }, { _id: 1 }).lean();
    const due = await m()
      .Assessment.find({ classId: { $in: ongoing.map((c) => c._id) }, confirmedAt: null, heldOn: { $lt: startOfVnDay(addVnDays(DEMO_TODAY, 1)) } })
      .lean();
    expect(due.length).toBeGreaterThanOrEqual(1);
  });

  it('FR-ADM-04: HV demo đăng nhập được (mã HV và Password1), nhân viên demo cũng vậy, không bị buộc đổi mật khẩu', async () => {
    for (const username of ['HV202600001', 'HV202600060', 'manager@center.local', 'staff1@center.local', 'teacher1@center.local']) {
      const res = await login(username);
      expect({ username, status: res.status }).toEqual({ username, status: 200 });
      expect(res.body.data.user.mustChangePassword).toBe(false);
    }
  });

  it('chạy lại với --reset idempotent (cùng số lượng, cùng mã HV); chạy lại không --reset thì giữ nguyên', async () => {
    const before = await snapshot(t.conn);
    await runSeedDemo(t.app, { clock: t.clock, reset: true });
    const after = await snapshot(t.conn);
    expect(after).toEqual(before);
    expect(await runSeedDemo(t.app, { clock: t.clock })).toMatchObject({ status: 'exists' });
    expect(await snapshot(t.conn)).toEqual(before);
    expect((await login('HV202600001')).status).toBe(200);
    await assertSeatedHistory(t.conn);
    await assertInvoiceInvariants(t.conn);
  });

  it('NFR-02 seed:large (SEED_STUDENTS=50, SEED_CLASSES=5): chèn thô nhưng có classHistory + history stamp, hóa đơn hợp lệ', async () => {
    const res = await runSeedLarge(t.conn, { students: 50, classes: 5, today: DEMO_TODAY });
    expect(res).toMatchObject({ students: 50, classes: 5 });
    const large = await m().Class.find({ code: /^L-/ }).lean();
    expect(large).toHaveLength(5);
    expect(await m().Student.countDocuments({ code: /^HVL/ })).toBe(50);
    expect(await m().User.countDocuments({ role: Role.STUDENT, username: /^HVL/ })).toBe(50);
    const ids = large.map((c) => c._id);
    expect(await m().Enrollment.countDocuments({ classId: { $in: ids } })).toBeGreaterThan(0);
    expect(await m().Session.countDocuments({ classId: { $in: ids } })).toBeGreaterThan(0);
    expect(await m().Attendance.countDocuments({ classId: { $in: ids } })).toBeGreaterThan(0);
    expect(await m().Invoice.countDocuments({ classId: { $in: ids } })).toBeGreaterThan(0);
    await assertSeatedHistory(t.conn);
    await assertInvoiceInvariants(t.conn);
    // currentSize matches ENROLLED seats.
    for (const c of large) {
      expect(await m().Enrollment.countDocuments({ classId: c._id, status: EnrollmentStatus.ENROLLED })).toBe(c.currentSize);
    }
    // Rerun is a no-op, also after a partial run that left only course LARGE behind (no duplicate key).
    expect(await runSeedLarge(t.conn, { students: 50, classes: 5, today: DEMO_TODAY })).toMatchObject({ status: 'exists' });
    await m().Class.deleteMany({ code: /^L-/ });
    expect(await runSeedLarge(t.conn, { students: 50, classes: 5, today: DEMO_TODAY })).toMatchObject({ status: 'exists' });
  });
});

describe('seed:large sessionsPerClass (W4 D36)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await makeUser(t.conn, { role: Role.ADMIN });
  });
  afterAll(async () => {
    await t.close();
  });

  it('NFR-02 runSeedLarge(…, { students: 20, classes: 2, sessionsPerClass: 3 }) → mỗi lớp L-* có đúng 3 session', async () => {
    await runSeedLarge(t.conn, { students: 20, classes: 2, sessionsPerClass: 3, today: DEMO_TODAY });
    const m = models(t.conn);
    const large = await m.Class.find({ code: /^L-/ }).lean();
    expect(large).toHaveLength(2);
    for (const c of large) {
      expect({ code: c.code, sessions: await m.Session.countDocuments({ classId: c._id }) }).toEqual({ code: c.code, sessions: 3 });
    }
  });

  it('NFR-02 sessionsPerClass lớn hơn 16 → lớp kéo dài endDate để mọi buổi nằm trong [startDate, endDate]', async () => {
    await t.conn.dropDatabase();
    await makeUser(t.conn, { role: Role.ADMIN });
    await runSeedLarge(t.conn, { students: 20, classes: 2, sessionsPerClass: 40, today: DEMO_TODAY });
    const m = models(t.conn);
    for (const c of await m.Class.find({ code: /^L-/ }).lean()) {
      const sessions = await m.Session.find({ classId: c._id }).sort({ startAt: 1 }).lean();
      expect(sessions.length).toBe(40);
      expect(vnDay(sessions[0].startAt) >= vnDay(c.startDate)).toBe(true);
      expect(vnDay(sessions[39].startAt)).toBe(vnDay(c.endDate));
    }
  });
});
