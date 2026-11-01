import { Types } from 'mongoose';
import { ClassStatus, EnrollmentStatus, Role } from '@lc/shared';
import { runMigrateClassHistory } from '../../scripts/migrate-class-history';
import { teacherStudentsFilter } from '../../src/common/scope/scope.service';
import { makeAssessment, makeClass, makeCourse, makeEnrollment, makeGrade, makeStudent, models } from '../factories';
import { DEFAULT_PASSWORD } from '../factories/user.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

const DAY = 24 * 60 * 60_000;

describe('FR-CLS-12 R22 backfill classHistory', () => {
  let t: TestApp;
  const m = () => models(t.conn);
  const raw = () => t.conn.collection('enrollments');
  const ids = (list: unknown[] | undefined) => (list ?? []).map(String).sort();

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  /** Pre-R22 row: written straight to the collection, no classHistory field at all. */
  async function legacy(doc: Record<string, unknown>): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    const at = new Date('2025-12-01T02:00:00Z');
    await raw().insertOne({
      _id,
      studentId: new Types.ObjectId(),
      courseId: new Types.ObjectId(),
      classId: null,
      status: EnrollmentStatus.ENROLLED,
      history: [],
      createdAt: at,
      updatedAt: at,
      ...doc,
    });
    return _id;
  }

  it('enrollment có classId, classHistory [] → sau migrate chứa classId', async () => {
    const cls = await makeClass(t.conn);
    const e = await makeEnrollment(t.conn, { classId: cls._id, courseId: cls.courseId, status: EnrollmentStatus.ENROLLED, classHistory: [] });
    const noField = await legacy({ classId: cls._id });
    const before = (await raw().findOne({ _id: e._id }))?.updatedAt as Date;

    const res = await runMigrateClassHistory(t.conn);
    expect(res.updated).toBeGreaterThanOrEqual(2);
    expect(res.scanned).toBeGreaterThanOrEqual(res.updated);
    const after = await raw().findOne({ _id: e._id });
    expect(ids(after?.classHistory)).toEqual([String(cls._id)]);
    expect(ids((await raw().findOne({ _id: noField }))?.classHistory)).toEqual([String(cls._id)]);
    // timestamps: false — the backfill is not a user edit.
    expect((after?.updatedAt as Date).toISOString()).toBe(before.toISOString());
  });

  it('mục history to ENROLLED/TRANSFERRED có classId → classId vào classHistory', async () => {
    const [a, b, c] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    const at = new Date('2025-11-01T02:00:00Z');
    const id = await legacy({
      classId: c,
      history: [
        { from: null, to: EnrollmentStatus.ENROLLED, at, classId: a },
        { from: EnrollmentStatus.ENROLLED, to: EnrollmentStatus.TRANSFERRED, at, classId: b },
        { from: EnrollmentStatus.TRANSFERRED, to: EnrollmentStatus.RESERVED, at },
        { from: EnrollmentStatus.RESERVED, to: EnrollmentStatus.WAITING_CLASS, at, classId: new Types.ObjectId() },
      ],
    });
    await runMigrateClassHistory(t.conn);
    // Only ENROLLED/TRANSFERRED entries count; the WAITING_CLASS entry's classId is ignored.
    expect(ids((await raw().findOne({ _id: id }))?.classHistory)).toEqual([a, b, c].map(String).sort());
  });

  it('chạy lại → updated 0 (idempotent)', async () => {
    await legacy({ classId: new Types.ObjectId() });
    const first = await runMigrateClassHistory(t.conn);
    expect(first.updated).toBeGreaterThanOrEqual(1);
    const second = await runMigrateClassHistory(t.conn);
    expect(second).toEqual({ scanned: first.scanned, updated: 0 });
  });

  it('HV đã chuyển lớp (dữ liệu kiểu cũ) sau migrate vẫn xem /results lớp cũ', async () => {
    const course = await makeCourse(t.conn);
    const clsA = await makeClass(t.conn, { courseId: course._id, status: ClassStatus.ONGOING });
    const clsB = await makeClass(t.conn, { courseId: course._id, status: ClassStatus.ONGOING });
    const st = await makeStudent(t.conn, { withUser: true });
    const at = new Date(t.clock.now().getTime() - 30 * DAY);
    // Reserved in A, resumed, reassigned to B — before R22 the row kept only classId = B.
    const enrollmentId = await legacy({
      studentId: st._id,
      courseId: course._id,
      classId: clsB._id,
      history: [
        { from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED, at, classId: clsA._id },
        { from: EnrollmentStatus.ENROLLED, to: EnrollmentStatus.RESERVED, at: new Date(at.getTime() + DAY) },
        { from: EnrollmentStatus.RESERVED, to: EnrollmentStatus.WAITING_CLASS, at: new Date(at.getTime() + 2 * DAY) },
        { from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED, at: new Date(at.getTime() + 3 * DAY), classId: clsB._id },
      ],
    });
    const a = await makeAssessment(t.conn, { classId: clsA._id, weight: 30, confirmedAt: at });
    await makeGrade(t.conn, { assessmentId: a._id, studentId: st._id, enrollmentId, score: 8, isDraft: false });

    const login = await t.http().post('/api/v1/auth/login').send({ username: st.code, password: DEFAULT_PASSWORD }).expect(200);
    const me = { Authorization: `Bearer ${login.body.data.accessToken as string}` };
    const rowsOfA = async () =>
      ((await t.http().get(`/api/v1/results?classId=${clsA._id}`).set(me).expect(200)).body.data as Array<{ classId: string }>);
    expect(await rowsOfA()).toHaveLength(0);

    await runMigrateClassHistory(t.conn);
    const rows = await rowsOfA();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ classId: String(clsA._id), average: 8 });
    await m().Enrollment.deleteOne({ _id: enrollmentId });
  });

  it('enrollments có index { classHistory: 1 }', async () => {
    const list = (await raw().indexes()) as Array<{ key: Record<string, number> }>;
    expect(list.some((i) => JSON.stringify(i.key) === JSON.stringify({ classHistory: 1 }))).toBe(true);
  });
});

describe('FR-STU-01 D38 GV thấy HV đã chuyển khỏi lớp mình', () => {
  let t: TestApp;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  /** Student seated in A (teacher A), reserved, resumed, reassigned to B: classId = B, classHistory = [A, B]. */
  async function setup() {
    const teacherA = await loginAs(t, Role.TEACHER);
    const course = await makeCourse(t.conn);
    const clsA = await makeClass(t.conn, { courseId: course._id, teacherId: teacherA.user._id });
    const clsB = await makeClass(t.conn, { courseId: course._id });
    const st = await makeStudent(t.conn);
    await makeEnrollment(t.conn, {
      studentId: st._id,
      courseId: course._id,
      classId: clsB._id,
      status: EnrollmentStatus.ENROLLED,
      classHistory: [clsA._id, clsB._id],
    });
    return { teacherA, st };
  }

  it('GV lớp cũ GET /students/:id HV đã chuyển → 200', async () => {
    const { teacherA, st } = await setup();
    const res = await t.http().get(`/api/v1/students/${st._id}`).set(auth(teacherA.token));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(String(st._id));
  });

  it('GV không liên quan → 404', async () => {
    const { st } = await setup();
    const other = await loginAs(t, Role.TEACHER);
    await makeClass(t.conn, { teacherId: other.user._id });
    const res = await t.http().get(`/api/v1/students/${st._id}`).set(auth(other.token));
    expect(res.status).toBe(404);
  });

  it('GET /students của GV lớp cũ có HV đó', async () => {
    const { teacherA, st } = await setup();
    const res = await t.http().get('/api/v1/students?limit=100').set(auth(teacherA.token)).expect(200);
    expect((res.body.data as Array<{ id: string }>).map((s) => s.id)).toContain(String(st._id));
  });

  it('HV có enrollment CANCELLED/WAITING_CLASS với classHistory lớp GV → vẫn 404', async () => {
    const teacher = await loginAs(t, Role.TEACHER);
    const cls = await makeClass(t.conn, { teacherId: teacher.user._id });
    const st = await makeStudent(t.conn);
    await makeEnrollment(t.conn, { studentId: st._id, courseId: cls.courseId, status: EnrollmentStatus.CANCELLED, classHistory: [cls._id] });
    expect((await t.http().get(`/api/v1/students/${st._id}`).set(auth(teacher.token))).status).toBe(404);
  });

  it('truy vấn HV của GV dùng index (không COLLSCAN)', async () => {
    const plan = await models(t.conn)
      .Enrollment.find(teacherStudentsFilter([new Types.ObjectId(), new Types.ObjectId()]), { studentId: 1 })
      .explain('queryPlanner');
    const text = JSON.stringify(plan);
    expect(text).toContain('IXSCAN');
    expect(text).not.toContain('COLLSCAN');
  });
});
