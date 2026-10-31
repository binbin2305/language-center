import { Types } from 'mongoose';
import { EnrollmentStatus, ErrorCode, PlacementStatus, Role, RoomStatus } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import {
  makeClass,
  makeCourse,
  makeEnrollment,
  makePlacementTest,
  makeRoom,
  makeSession,
  makeStudent,
  makeTeacher,
  models,
} from '../factories';

describe('FR-PLT-01..04 Kiểm tra đầu vào', () => {
  let t: TestApp;
  let manager: string;
  let staff: string;
  let admin: string;
  let student: string;
  let teacher: { token: string; id: string };
  let otherTeacher: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = (p: string) => `/api/v1${p}`;
  const create = (token: string, body: object) => t.http().post(api('/placement-tests')).set(auth(token)).send(body);
  const patch = (token: string, id: string | Types.ObjectId, body: object) =>
    t.http().patch(api(`/placement-tests/${id}`)).set(auth(token)).send(body);
  const addCandidates = (token: string, id: string | Types.ObjectId, ids: Array<string | Types.ObjectId>) =>
    t.http().post(api(`/placement-tests/${id}/candidates`)).set(auth(token)).send({ enrollmentIds: ids.map(String) });
  const putResults = (token: string, id: string | Types.ObjectId, body: object) =>
    t.http().put(api(`/placement-tests/${id}/results`)).set(auth(token)).send(body);
  const skip = (token: string, id: string | Types.ObjectId, body: object) =>
    t.http().post(api(`/enrollments/${id}/skip-placement`)).set(auth(token)).send(body);

  const at = (h: number) => new Date(Date.UTC(2026, 2, 10, h)).toISOString();

  async function body(over: Record<string, unknown> = {}) {
    const course = await makeCourse(t.conn);
    const room = await makeRoom(t.conn);
    const tch = await makeTeacher(t.conn);
    return {
      courseId: course._id.toString(),
      roomId: room._id.toString(),
      teacherId: tch._id.toString(),
      startAt: at(2),
      endAt: at(4),
      ...over,
    };
  }

  /** A SCHEDULED test with one PENDING_PLACEMENT candidate, taught by `teacher`. */
  async function scheduled(n = 1, teacherId = teacher.id) {
    const course = await makeCourse(t.conn);
    const enrollments = [];
    for (let i = 0; i < n; i++) enrollments.push(await makeEnrollment(t.conn, { courseId: course._id }));
    const pt = await makePlacementTest(t.conn, {
      courseId: course._id,
      teacherId: new Types.ObjectId(teacherId),
      candidates: enrollments.map((e) => ({
        enrollmentId: e._id,
        studentId: e.studentId,
        score: null,
        level: null,
        gradedAt: null,
        gradedBy: null,
      })),
    });
    return { course, enrollments, pt };
  }

  beforeAll(async () => {
    t = await createTestApp();
    await models(t.conn).Enrollment.syncIndexes();
    manager = (await loginAs(t, Role.MANAGER)).token;
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    admin = (await loginAs(t, Role.ADMIN)).token;
    const s = await makeStudent(t.conn);
    student = (await loginAs(t, Role.STUDENT, { studentId: s._id })).token;
    const tl = await loginAs(t, Role.TEACHER);
    teacher = { token: tl.token, id: tl.user._id.toString() };
    otherTeacher = (await loginAs(t, Role.TEACHER)).token;
  });
  afterAll(async () => {
    await t.close();
  });

  describe('tạo / sửa đợt', () => {
    it('M, S tạo đợt → 201 có nhãn, và có counter lock:room', async () => {
      const b = await body();
      const res = await create(manager, b).expect(201);
      expect(res.body.data).toMatchObject({ courseId: b.courseId, status: PlacementStatus.SCHEDULED, candidates: [] });
      expect(res.body.data.roomCode).toBeDefined();
      expect(res.body.data.teacherName).toBeDefined();
      expect(res.body.data.courseName).toBeDefined();
      expect(await t.conn.collection('counters').findOne({ _id: `lock:room:${b.roomId}` as never })).not.toBeNull();
      expect(await t.conn.collection('counters').findOne({ _id: `lock:teacher:${b.teacherId}` as never })).not.toBeNull();
      await create(staff, await body()).expect(201);
    });

    it('trùng phòng với session SCHEDULED → 409 SCHEDULE_CONFLICT details.conflicts', async () => {
      const room = await makeRoom(t.conn);
      const cls = await makeClass(t.conn);
      await makeSession(t.conn, { classId: cls._id, roomId: room._id, startAt: new Date(at(3)), endAt: new Date(at(5)) });
      const res = await create(manager, await body({ roomId: room._id.toString() })).expect(409);
      expect(res.body.error.code).toBe(ErrorCode.SCHEDULE_CONFLICT);
      expect(res.body.error.details.conflicts).toHaveLength(1);
      expect(res.body.error.details.conflicts[0].kind).toBe('ROOM');
    });

    it('trùng GV với đợt khác → 409', async () => {
      const other = await makePlacementTest(t.conn, { startAt: new Date(at(3)), endAt: new Date(at(5)) });
      const res = await create(manager, await body({ teacherId: other.teacherId.toString() })).expect(409);
      expect(res.body.error.code).toBe(ErrorCode.SCHEDULE_CONFLICT);
      expect(res.body.error.details.conflicts[0]).toMatchObject({ kind: 'TEACHER', placementTestId: other._id.toString() });
    });

    it('endAt ≤ startAt → 400', async () => {
      await create(manager, await body({ endAt: at(2) })).expect(400);
    });

    it('teacherId không phải TEACHER → 400 fields.teacherId', async () => {
      const mgr = await loginAs(t, Role.MANAGER);
      const res = await create(manager, await body({ teacherId: mgr.user._id.toString() })).expect(400);
      expect(res.body.error.details.fields).toHaveProperty('teacherId');
    });

    it('room INACTIVE → 400 fields.roomId', async () => {
      const room = await makeRoom(t.conn, { status: RoomStatus.INACTIVE });
      const res = await create(manager, await body({ roomId: room._id.toString() })).expect(400);
      expect(res.body.error.details.fields).toHaveProperty('roomId');
    });

    it('PATCH đổi giờ gây xung đột → 409; đổi giờ không xung đột với chính nó → 200', async () => {
      const pt = await makePlacementTest(t.conn, { startAt: new Date(at(2)), endAt: new Date(at(4)) });
      await makePlacementTest(t.conn, {
        roomId: pt.roomId,
        startAt: new Date(at(6)),
        endAt: new Date(at(8)),
      });
      await patch(manager, pt._id, { startAt: at(5), endAt: at(7) }).expect(409);
      const res = await patch(staff, pt._id, { startAt: at(3), endAt: at(5) }).expect(200);
      expect(res.body.data.startAt).toBe(at(3));
    });

    it('PATCH đổi status CANCELLED → 200; đợt CANCELLED/COMPLETED không sửa → 422 INVALID_STATUS_TRANSITION', async () => {
      const pt = await makePlacementTest(t.conn);
      await patch(manager, pt._id, { status: PlacementStatus.CANCELLED }).expect(200);
      const res = await patch(manager, pt._id, { startAt: at(9), endAt: at(10) }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
      const done = await makePlacementTest(t.conn, { status: PlacementStatus.COMPLETED });
      await patch(manager, done._id, { status: PlacementStatus.CANCELLED }).expect(422);
    });
  });

  describe('thí sinh', () => {
    it('thêm thí sinh PENDING_PLACEMENT → 200; thêm lại → bỏ qua', async () => {
      const pt = await makePlacementTest(t.conn);
      const e = await makeEnrollment(t.conn, { courseId: pt.courseId });
      const r1 = await addCandidates(manager, pt._id, [e._id]).expect(200);
      expect(r1.body.data.candidates).toHaveLength(1);
      expect(r1.body.data.candidates[0]).toMatchObject({ enrollmentId: e._id.toString(), score: null, level: null });
      const r2 = await addCandidates(staff, pt._id, [e._id]).expect(200);
      expect(r2.body.data.candidates).toHaveLength(1);
    });

    it('enrollment WAITING_CLASS → 422 ENROLLMENT_INVALID_STATE', async () => {
      const pt = await makePlacementTest(t.conn);
      const e = await makeEnrollment(t.conn, { courseId: pt.courseId, status: EnrollmentStatus.WAITING_CLASS });
      const res = await addCandidates(manager, pt._id, [e._id]).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.ENROLLMENT_INVALID_STATE);
    });

    it('enrollment khác khóa của đợt → 422 COURSE_MISMATCH', async () => {
      const pt = await makePlacementTest(t.conn);
      const e = await makeEnrollment(t.conn);
      const res = await addCandidates(manager, pt._id, [e._id]).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.COURSE_MISMATCH);
    });

    it('enrollment đang là thí sinh của đợt SCHEDULED khác → 422', async () => {
      const { enrollments } = await scheduled(1);
      const pt2 = await makePlacementTest(t.conn, { courseId: enrollments[0].courseId });
      const res = await addCandidates(manager, pt2._id, [enrollments[0]._id]).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.ENROLLMENT_INVALID_STATE);
    });

    it('enrollment không tồn tại → 404; đợt không SCHEDULED → 422', async () => {
      const pt = await makePlacementTest(t.conn);
      await addCandidates(manager, pt._id, [new Types.ObjectId()]).expect(404);
      const done = await makePlacementTest(t.conn, { status: PlacementStatus.CANCELLED });
      const e = await makeEnrollment(t.conn, { courseId: done.courseId });
      await addCandidates(manager, done._id, [e._id]).expect(422);
    });
  });

  describe('kết quả', () => {
    it('GV được phân công PUT results → 200', async () => {
      const { enrollments, pt } = await scheduled(2);
      const res = await putResults(teacher.token, pt._id, [
        { enrollmentId: enrollments[0]._id.toString(), score: 7.5, level: 'A2', comment: 'ok' },
      ]).expect(200);
      expect(res.body.data.status).toBe(PlacementStatus.SCHEDULED);
      const c = res.body.data.candidates.find((x: { enrollmentId: string }) => x.enrollmentId === enrollments[0]._id.toString());
      expect(c).toMatchObject({ score: 7.5, level: 'A2', comment: 'ok' });
      expect(c.gradedAt).toBe(t.clock.now().toISOString());
      expect(c.gradedBy).toBe(teacher.id);
    });

    it('GV khác → 404; M, S, ADMIN → 403', async () => {
      const { enrollments, pt } = await scheduled(1);
      const b = [{ enrollmentId: enrollments[0]._id.toString(), score: 5, level: 'A1' }];
      await putResults(otherTeacher, pt._id, b).expect(404);
      await putResults(manager, pt._id, b).expect(403);
      await putResults(staff, pt._id, b).expect(403);
      await putResults(admin, pt._id, b).expect(403);
    });

    it('score 10.25 → 400 SCORE_OUT_OF_RANGE details.enrollmentIds; score 11 → 400', async () => {
      const { enrollments, pt } = await scheduled(1);
      const id = enrollments[0]._id.toString();
      for (const score of [10.25, 11, 7.1, -1]) {
        const res = await putResults(teacher.token, pt._id, [{ enrollmentId: id, score, level: 'A1' }]).expect(400);
        expect(res.body.error.code).toBe(ErrorCode.SCORE_OUT_OF_RANGE);
        expect(res.body.error.details.enrollmentIds).toEqual([id]);
      }
    });

    it('level "Z9" không thuộc course.levels → 400 fields.level', async () => {
      const { enrollments, pt } = await scheduled(1);
      const res = await putResults(teacher.token, pt._id, [
        { enrollmentId: enrollments[0]._id.toString(), score: 5, level: 'Z9' },
      ]).expect(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(res.body.error.details.fields).toHaveProperty('level');
    });

    it('enrollmentId không phải thí sinh → 400 VALIDATION_FAILED', async () => {
      const { pt } = await scheduled(1);
      const res = await putResults(teacher.token, pt._id, [
        { enrollmentId: new Types.ObjectId().toString(), score: 5, level: 'A1' },
      ]).expect(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    it('có score+level → WAITING_CLASS, placementLevel, waitingSince = now, history', async () => {
      const { enrollments, pt } = await scheduled(2);
      await putResults(teacher.token, pt._id, [
        { enrollmentId: enrollments[0]._id.toString(), score: 8, level: 'B1' },
      ]).expect(200);
      const e = await models(t.conn).Enrollment.findById(enrollments[0]._id).lean();
      expect(e?.status).toBe(EnrollmentStatus.WAITING_CLASS);
      expect(e?.placementLevel).toBe('B1');
      expect(e?.waitingSince).toEqual(t.clock.now());
      expect(e?.history).toHaveLength(1);
      expect(e?.history[0]).toMatchObject({ from: 'PENDING_PLACEMENT', to: 'WAITING_CLASS' });
      expect(e?.history[0].by?.toString()).toBe(teacher.id);
      expect(
        await t.conn.collection('audit_logs').countDocuments({ entity: 'enrollment', entityId: enrollments[0]._id }),
      ).toBeGreaterThanOrEqual(1);
    });

    it('PUT lại đổi level → placementLevel mới, history không thêm mục', async () => {
      const { enrollments, pt } = await scheduled(2);
      const id = enrollments[0]._id.toString();
      await putResults(teacher.token, pt._id, [{ enrollmentId: id, score: 8, level: 'B1' }]).expect(200);
      await putResults(teacher.token, pt._id, [{ enrollmentId: id, score: 6, level: 'A2' }]).expect(200);
      const e = await models(t.conn).Enrollment.findById(id).lean();
      expect(e?.placementLevel).toBe('A2');
      expect(e?.status).toBe(EnrollmentStatus.WAITING_CLASS);
      expect(e?.history).toHaveLength(1);
    });

    it('chỉ có score, level null → enrollment giữ PENDING_PLACEMENT', async () => {
      const { enrollments, pt } = await scheduled(1);
      await putResults(teacher.token, pt._id, [
        { enrollmentId: enrollments[0]._id.toString(), score: 4, level: null },
      ]).expect(200);
      const e = await models(t.conn).Enrollment.findById(enrollments[0]._id).lean();
      expect(e?.status).toBe(EnrollmentStatus.PENDING_PLACEMENT);
      const p = await models(t.conn).PlacementTest.findById(pt._id).lean();
      expect(p?.status).toBe(PlacementStatus.SCHEDULED);
    });

    it('đủ mọi thí sinh có kết quả → đợt COMPLETED', async () => {
      const { enrollments, pt } = await scheduled(2);
      const res = await putResults(
        teacher.token,
        pt._id,
        enrollments.map((e) => ({ enrollmentId: e._id.toString(), score: 9, level: 'A1' })),
      ).expect(200);
      expect(res.body.data.status).toBe(PlacementStatus.COMPLETED);
    });

    it('enrollment đã skip-placement trước → PUT results 422 ENROLLMENT_INVALID_STATE details.enrollmentIds', async () => {
      const { enrollments, pt } = await scheduled(2);
      await skip(manager, enrollments[0]._id, { level: 'A1', reason: 'Có chứng chỉ' }).expect(201);
      const res = await putResults(teacher.token, pt._id, [
        { enrollmentId: enrollments[0]._id.toString(), score: 9, level: 'A1' },
        { enrollmentId: enrollments[1]._id.toString(), score: 9, level: 'A1' },
      ]).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.ENROLLMENT_INVALID_STATE);
      expect(res.body.error.details.enrollmentIds).toEqual([enrollments[0]._id.toString()]);
      // all-or-nothing
      const e1 = await models(t.conn).Enrollment.findById(enrollments[1]._id).lean();
      expect(e1?.status).toBe(EnrollmentStatus.PENDING_PLACEMENT);
    });

    it('thí sinh đã xếp bởi đợt này: gửi lại score null hoặc level null → 422, không lệch placementLevel', async () => {
      const { enrollments, pt } = await scheduled(2);
      const id = enrollments[0]._id.toString();
      await putResults(teacher.token, pt._id, [{ enrollmentId: id, score: 8, level: 'B1' }]).expect(200);
      for (const item of [
        { enrollmentId: id, score: null, level: 'A2' },
        { enrollmentId: id, score: 8, level: null },
      ]) {
        const res = await putResults(teacher.token, pt._id, [item]).expect(422);
        expect(res.body.error.code).toBe(ErrorCode.ENROLLMENT_INVALID_STATE);
        expect(res.body.error.details.enrollmentIds).toEqual([id]);
      }
      const e = await models(t.conn).Enrollment.findById(id).lean();
      expect(e?.placementLevel).toBe('B1');
      const p = await models(t.conn).PlacementTest.findById(pt._id).lean();
      expect(p?.candidates.find((c) => c.enrollmentId.toString() === id)).toMatchObject({ score: 8, level: 'B1' });
    });

    it('thí sinh đã skip-placement không chặn đợt COMPLETED khi các thí sinh còn lại đủ kết quả', async () => {
      const { enrollments, pt } = await scheduled(2);
      await skip(manager, enrollments[0]._id, { level: 'A1', reason: 'Có chứng chỉ' }).expect(201);
      const res = await putResults(teacher.token, pt._id, [
        { enrollmentId: enrollments[1]._id.toString(), score: 9, level: 'A1' },
      ]).expect(200);
      expect(res.body.data.status).toBe(PlacementStatus.COMPLETED);
    });

    it('GV không được phân công gửi điểm không hợp lệ → 404 (không phải 400)', async () => {
      const { enrollments, pt } = await scheduled(1);
      await putResults(otherTeacher, pt._id, [
        { enrollmentId: enrollments[0]._id.toString(), score: 11, level: 'A1' },
      ]).expect(404);
    });

    it('đợt không SCHEDULED → 422 INVALID_STATUS_TRANSITION', async () => {
      const { enrollments, pt } = await scheduled(1);
      await models(t.conn).PlacementTest.updateOne({ _id: pt._id }, { status: PlacementStatus.CANCELLED });
      const res = await putResults(teacher.token, pt._id, [
        { enrollmentId: enrollments[0]._id.toString(), score: 9, level: 'A1' },
      ]).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
    });
  });

  describe('skip-placement', () => {
    it('lý do rỗng → 400 REASON_REQUIRED', async () => {
      const e = await makeEnrollment(t.conn);
      const res = await skip(manager, e._id, { level: 'A1', reason: '   ' }).expect(400);
      expect(res.body.error.code).toBe(ErrorCode.REASON_REQUIRED);
    });

    it('có lý do → WAITING_CLASS + placementSkipped + placementLevel + history', async () => {
      const e = await makeEnrollment(t.conn);
      const res = await skip(staff, e._id, { level: 'A2', reason: 'Có chứng chỉ IELTS' }).expect(201);
      expect(res.body.data).toMatchObject({
        status: EnrollmentStatus.WAITING_CLASS,
        placementLevel: 'A2',
        placementSkipped: { reason: 'Có chứng chỉ IELTS' },
        waitingSince: t.clock.now().toISOString(),
      });
      expect(res.body.data.placementSkipped.by).toBe(res.body.data.history.at(-1).by);
      expect(res.body.data.placementSkipped.at).toBe(t.clock.now().toISOString());
      expect(res.body.data.history.at(-1)).toMatchObject({ from: 'PENDING_PLACEMENT', to: 'WAITING_CLASS' });
    });

    it('enrollment không PENDING_PLACEMENT → 422; level không thuộc khóa → 400; không tồn tại → 404', async () => {
      const w = await makeEnrollment(t.conn, { status: EnrollmentStatus.WAITING_CLASS });
      const res = await skip(manager, w._id, { level: 'A1', reason: 'x' }).expect(422);
      expect(res.body.error.code).toBe(ErrorCode.ENROLLMENT_INVALID_STATE);
      const e = await makeEnrollment(t.conn);
      const r2 = await skip(manager, e._id, { level: 'Z9', reason: 'x' }).expect(400);
      expect(r2.body.error.details.fields).toHaveProperty('level');
      await skip(manager, new Types.ObjectId(), { level: 'A1', reason: 'x' }).expect(404);
      await skip(manager, 'not-an-id', { level: 'A1', reason: 'x' }).expect(404);
    });

    it('T, H, ADMIN → 403', async () => {
      const e = await makeEnrollment(t.conn);
      for (const tok of [teacher.token, student, admin]) await skip(tok, e._id, { level: 'A1', reason: 'x' }).expect(403);
    });
  });

  describe('đọc & phân quyền', () => {
    it('GET /placement-tests: GV chỉ thấy đợt của mình; M thấy cả', async () => {
      const mine = await makePlacementTest(t.conn, { teacherId: new Types.ObjectId(teacher.id), startAt: new Date(at(12)), endAt: new Date(at(13)) });
      const theirs = await makePlacementTest(t.conn);
      const res = await t.http().get(api('/placement-tests?limit=100')).set(auth(teacher.token)).expect(200);
      const ids = res.body.data.map((x: { id: string }) => x.id);
      expect(ids).toContain(mine._id.toString());
      expect(ids).not.toContain(theirs._id.toString());
      expect(res.body.meta).toMatchObject({ page: 1 });
      const all = await t.http().get(api('/placement-tests?limit=100')).set(auth(manager)).expect(200);
      const allIds = all.body.data.map((x: { id: string }) => x.id);
      expect(allIds).toEqual(expect.arrayContaining([mine._id.toString(), theirs._id.toString()]));
      expect(all.body.data[0].courseName).toBeDefined();
      const f = await t.http().get(api(`/placement-tests?status=COMPLETED&courseId=${mine.courseId}`)).set(auth(staff)).expect(200);
      expect(f.body.data).toHaveLength(0);
    });

    it('GET /:id: GV được phân công → 200 có tên học viên; GV khác → 404', async () => {
      const { pt } = await scheduled(1);
      const res = await t.http().get(api(`/placement-tests/${pt._id}`)).set(auth(teacher.token)).expect(200);
      expect(res.body.data.candidates[0].studentName).toBeDefined();
      await t.http().get(api(`/placement-tests/${pt._id}`)).set(auth(otherTeacher)).expect(404);
      await t.http().get(api(`/placement-tests/${new Types.ObjectId()}`)).set(auth(manager)).expect(404);
      await t.http().get(api('/placement-tests/xyz')).set(auth(manager)).expect(404);
    });

    it('H, ADMIN → 403 mọi route; T → 403 với route ghi (trừ PUT results)', async () => {
      const pt = await makePlacementTest(t.conn);
      const e = await makeEnrollment(t.conn, { courseId: pt.courseId });
      for (const tok of [student, admin]) {
        await t.http().get(api('/placement-tests')).set(auth(tok)).expect(403);
        await t.http().get(api(`/placement-tests/${pt._id}`)).set(auth(tok)).expect(403);
        await create(tok, await body()).expect(403);
        await patch(tok, pt._id, { status: PlacementStatus.CANCELLED }).expect(403);
        await addCandidates(tok, pt._id, [e._id]).expect(403);
        await putResults(tok, pt._id, [{ enrollmentId: e._id.toString(), score: 5, level: 'A1' }]).expect(403);
      }
      await create(teacher.token, await body()).expect(403);
      await patch(teacher.token, pt._id, { status: PlacementStatus.CANCELLED }).expect(403);
      await addCandidates(teacher.token, pt._id, [e._id]).expect(403);
    });
  });
});
