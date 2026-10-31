import { Types } from 'mongoose';
import { AttendanceStatus, EnrollmentStatus, Role } from '@lc/shared';
import { loginAs } from '../../helpers/auth';
import { createTestApp, TestApp } from '../../helpers/test-app';
import { DEFAULT_PASSWORD } from '../../factories/user.factory';
import { makeAssessment, makeClass, makeCourse, makeEnrollment, makeSession, makeStudent, models } from '../../factories';

const DAY = 24 * 60 * 60_000;

/** R22: classHistory keeps the history scope of a class across RESERVED → resume → reassign. */
describe('W2 phạm vi lịch sử sau bảo lưu → học lại → xếp lớp mới (FR-CLS-12, R22)', () => {
  let t: TestApp;
  let staff: string;
  let teacher: { token: string; id: Types.ObjectId };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = (p: string) => `/api/v1${p}`;
  const m = () => models(t.conn);
  const act = (id: Types.ObjectId | string, action: string, body: object = {}) =>
    t.http().post(api(`/enrollments/${id}/${action}`)).set(auth(staff)).send(body);

  /** Moves the FakeClock and re-logs the staff user in (access tokens expire with the clock). */
  const advance = async (ms: number) => {
    t.clock.advance(ms);
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
  };

  beforeAll(async () => {
    t = await createTestApp();
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    const tch = await loginAs(t, Role.TEACHER);
    teacher = { token: tch.token, id: tch.user._id };
  });
  afterAll(async () => {
    await t.close();
  });

  it('lớp A vẫn trong phạm vi lịch sử: /attendance, /results, /classes/A/assessments, transcript A; roster A chỉ trong thời gian học A', async () => {
    const course = await makeCourse(t.conn);
    const clsA = await makeClass(t.conn, { courseId: course._id, teacherId: teacher.id });
    const st = await makeStudent(t.conn, { withUser: true });
    const e = await makeEnrollment(t.conn, {
      studentId: st._id,
      courseId: course._id,
      status: EnrollmentStatus.WAITING_CLASS,
      placementLevel: 'A1',
      waitingSince: t.clock.now(),
    });
    await act(e._id, 'assign', { classId: clsA._id.toString() }).expect(201);
    expect((await m().Enrollment.findById(e._id).lean())?.classHistory?.map(String)).toEqual([clsA._id.toString()]);

    // Attendance + confirmed grades in A.
    const startAt = new Date(t.clock.now().getTime() + 10 * 60_000);
    const taken = await makeSession(t.conn, { classId: clsA._id, teacherId: teacher.id, startAt, endAt: new Date(startAt.getTime() + 90 * 60_000) });
    const untakenAt = new Date(startAt.getTime() + DAY);
    const untaken = await makeSession(t.conn, { classId: clsA._id, teacherId: teacher.id, startAt: untakenAt, endAt: new Date(untakenAt.getTime() + 90 * 60_000) });
    await t
      .http()
      .put(api(`/sessions/${taken._id}/attendance`))
      .set(auth(teacher.token))
      .send({ records: [{ studentId: st._id.toString(), status: AttendanceStatus.PRESENT }] })
      .expect(200);
    const a = await makeAssessment(t.conn, { classId: clsA._id, weight: 30 });
    await t
      .http()
      .put(api(`/assessments/${a._id}/grades`))
      .set(auth(teacher.token))
      .send({ grades: [{ studentId: st._id.toString(), score: 8 }], confirm: true })
      .expect(200);

    // Reserve → resume → reassign to B, each a few days apart.
    await advance(3 * DAY);
    await act(e._id, 'withdraw', { status: EnrollmentStatus.RESERVED, reason: 'Bảo lưu vì công tác' }).expect(201);
    await advance(3 * DAY);
    await act(e._id, 'resume').expect(201);
    const clsB = await makeClass(t.conn, { courseId: course._id });
    await advance(DAY);
    await act(e._id, 'assign', { classId: clsB._id.toString() }).expect(201);
    const after = await m().Enrollment.findById(e._id).lean();
    expect(after?.classId?.toString()).toBe(clsB._id.toString());
    expect(after?.classHistory?.map(String).sort()).toEqual([clsA._id.toString(), clsB._id.toString()].sort());

    const login = await t.http().post(api('/auth/login')).send({ username: st.code, password: DEFAULT_PASSWORD }).expect(200);
    const me = login.body.data.accessToken as string;

    const att = await t.http().get(api('/attendance')).set(auth(me)).expect(200);
    expect((att.body.data as Array<{ classId: string }>).map((r) => r.classId)).toContain(clsA._id.toString());

    const res = await t.http().get(api('/results')).set(auth(me)).expect(200);
    const rowA = (res.body.data as Array<{ classId: string; average: number | null }>).find((r) => r.classId === clsA._id.toString());
    expect(rowA).toMatchObject({ average: 8 });

    await t.http().get(api(`/classes/${clsA._id}/assessments`)).set(auth(me)).expect(200);
    await t.http().get(api(`/results/transcript.pdf?studentId=${st._id}&classId=${clsA._id}`)).set(auth(me)).expect(200);

    // D13 roster of A: a past untaken session in the A stint still lists the student; an A session after the B
    // assignment does not (the B stint must not count for A).
    const rosterOf = async (sessionId: Types.ObjectId) => {
      const r = await t.http().get(api(`/sessions/${sessionId}/attendance`)).set(auth(staff)).expect(200);
      return (r.body.data.roster as Array<{ studentId: string }>).map((x) => x.studentId);
    };
    expect(await rosterOf(untaken._id)).toContain(st._id.toString());
    const laterAt = new Date(t.clock.now().getTime() + DAY);
    const later = await makeSession(t.conn, { classId: clsA._id, teacherId: teacher.id, startAt: laterAt, endAt: new Date(laterAt.getTime() + 90 * 60_000) });
    expect(await rosterOf(later._id)).not.toContain(st._id.toString());
  });

  it('chuyển lớp: enrollment mới có classHistory = [lớp đích]', async () => {
    const course = await makeCourse(t.conn);
    const from = await makeClass(t.conn, { courseId: course._id });
    const to = await makeClass(t.conn, { courseId: course._id });
    const st = await makeStudent(t.conn);
    const e = await makeEnrollment(t.conn, {
      studentId: st._id,
      courseId: course._id,
      status: EnrollmentStatus.WAITING_CLASS,
      placementLevel: 'A1',
      waitingSince: t.clock.now(),
    });
    await act(e._id, 'assign', { classId: from._id.toString() }).expect(201);
    await act(e._id, 'transfer', { toClassId: to._id.toString(), reason: 'Đổi giờ học' }).expect(201);
    const fresh = await m().Enrollment.findOne({ studentId: st._id, classId: to._id }).lean();
    expect(fresh?.classHistory?.map(String)).toEqual([to._id.toString()]);
  });
});
