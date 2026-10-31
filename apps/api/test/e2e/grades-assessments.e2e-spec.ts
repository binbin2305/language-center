import { ClassStatus, EnrollmentStatus, ErrorCode, Role } from '@lc/shared';
import { SettingsService } from '../../src/common/settings/settings.service';
import { makeClass, makeEnrollment } from '../factories/academic.factory';
import { makeAssessment, makeGrade } from '../factories/assessment.factory';
import { makeStudent } from '../factories/student.factory';
import { DEFAULT_PASSWORD } from '../factories/user.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, DEFAULT_NOW, TestApp } from '../helpers/test-app';

describe('FR-GRD-01 Bài đánh giá của lớp', () => {
  let t: TestApp;
  let staff: string;
  beforeAll(async () => {
    t = await createTestApp();
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
  });
  afterAll(async () => {
    await t.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const list = (classId: unknown, token: string) =>
    t.http().get(`/api/v1/classes/${classId}/assessments`).set(auth(token));
  const post = (classId: unknown, token: string, body: object) =>
    t.http().post(`/api/v1/classes/${classId}/assessments`).set(auth(token)).send(body);
  const patch = (id: unknown, token: string, body: object) =>
    t.http().patch(`/api/v1/assessments/${id}`).set(auth(token)).send(body);
  const del = (id: unknown, token: string) => t.http().delete(`/api/v1/assessments/${id}`).set(auth(token));
  const body = (over: Record<string, unknown> = {}) => ({
    name: 'Quiz 1',
    type: 'QUIZ',
    weight: 10,
    heldOn: '2026-02-01',
    ...over,
  });
  async function teacherClass() {
    const teacher = await loginAs(t, Role.TEACHER);
    const cls = await makeClass(t.conn, { teacherId: teacher.user._id });
    return { teacher, cls };
  }

  describe('POST /classes/:id/assessments', () => {
    it('FR-GRD-01 tạo 60 + 40 -> ok; thêm 1 -> 422 WEIGHT_EXCEEDS_100', async () => {
      const cls = await makeClass(t.conn);
      const a = await post(cls._id, staff, body({ weight: 60 }));
      expect(a.status).toBe(201);
      expect(a.body.data).toMatchObject({ classId: String(cls._id), weight: 60, heldOn: '2026-02-01', confirmedAt: null, isLocked: false });
      await post(cls._id, staff, body({ weight: 40 })).expect(201);
      const r = await post(cls._id, staff, body({ weight: 1 }));
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe(ErrorCode.WEIGHT_EXCEEDS_100);
    });

    it('FR-GRD-01 PATCH 40 -> 50 khi tổng còn lại 60 -> 422; PATCH chính nó giữ nguyên weight -> 200', async () => {
      const cls = await makeClass(t.conn);
      await post(cls._id, staff, body({ weight: 60 })).expect(201);
      const b = await post(cls._id, staff, body({ weight: 40 })).expect(201);
      const r = await patch(b.body.data.id, staff, { weight: 50 });
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe(ErrorCode.WEIGHT_EXCEEDS_100);
      const ok = await patch(b.body.data.id, staff, { weight: 40, name: 'Mới' });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ weight: 40, name: 'Mới' });
    });

    it('FR-GRD-01 2 POST song song 60 + 60 vào lớp trống -> 1x201, 1x422', async () => {
      const cls = await makeClass(t.conn);
      const res = await Promise.all([post(cls._id, staff, body({ weight: 60 })), post(cls._id, staff, body({ weight: 60 }))]);
      expect(res.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(await t.conn.model('Assessment').countDocuments({ classId: cls._id })).toBe(1);
    });

    it.each([0, 101, -5])('FR-GRD-01 weight %s -> 400 fields.weight', async (weight) => {
      const cls = await makeClass(t.conn);
      const r = await post(cls._id, staff, body({ weight }));
      expect(r.status).toBe(400);
      expect(r.body.error.details.fields.weight).toBeDefined();
    });

    it('FR-GRD-01 PATCH weight không hợp lệ -> 400', async () => {
      const a = await makeAssessment(t.conn);
      await patch(a._id, staff, { weight: 0 }).expect(400);
    });

    it('FR-GRD-01 GV phụ trách và trợ giảng tạo được; GV lớp khác -> 404', async () => {
      const { teacher, cls } = await teacherClass();
      await post(cls._id, teacher.token, body({ weight: 20 })).expect(201);
      const ta = await loginAs(t, Role.TEACHER);
      await t.conn.model('Class').updateOne({ _id: cls._id }, { assistantTeacherId: ta.user._id });
      await post(cls._id, ta.token, body({ weight: 20 })).expect(201);
      const other = await loginAs(t, Role.TEACHER);
      await post(cls._id, other.token, body({ weight: 20 })).expect(404);
    });

    it('FR-GRD-01 lớp không tồn tại hoặc id hỏng -> 404', async () => {
      await post('64b000000000000000000000', staff, body()).expect(404);
      await post('xyz', staff, body()).expect(404);
    });

    it.each([Role.MANAGER, Role.ADMIN, Role.STUDENT])('FR-GRD-01 %s POST -> 403', async (role) => {
      const cls = await makeClass(t.conn);
      await post(cls._id, (await loginAs(t, role)).token, body()).expect(403);
    });

    it('FR-GRD-01 chưa đăng nhập -> 401', async () => {
      const cls = await makeClass(t.conn);
      await t.http().post(`/api/v1/classes/${cls._id}/assessments`).send(body()).expect(401);
    });
  });

  describe('PATCH/DELETE /assessments/:id', () => {
    it('FR-GRD-01 xóa bài đã có grade -> 422 ASSESSMENT_HAS_GRADES', async () => {
      const a = await makeAssessment(t.conn);
      await makeGrade(t.conn, { assessmentId: a._id });
      const r = await del(a._id, staff);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe(ErrorCode.ASSESSMENT_HAS_GRADES);
      expect(await t.conn.model('Assessment').countDocuments({ _id: a._id })).toBe(1);
    });

    it('FR-GRD-01 xóa bài trống -> 204', async () => {
      const a = await makeAssessment(t.conn);
      await del(a._id, staff).expect(204);
      expect(await t.conn.model('Assessment').countDocuments({ _id: a._id })).toBe(0);
    });

    it('FR-GRD-01 GV lớp khác PATCH/DELETE -> 404; GV phụ trách xóa được', async () => {
      const { teacher, cls } = await teacherClass();
      const a = await makeAssessment(t.conn, { classId: cls._id });
      const other = await loginAs(t, Role.TEACHER);
      await patch(a._id, other.token, { name: 'x' }).expect(404);
      await del(a._id, other.token).expect(404);
      await del(a._id, teacher.token).expect(204);
    });

    it.each([Role.MANAGER, Role.ADMIN, Role.STUDENT])('FR-GRD-01 %s PATCH/DELETE -> 403', async (role) => {
      const a = await makeAssessment(t.conn);
      const { token } = await loginAs(t, role);
      await patch(a._id, token, { name: 'x' }).expect(403);
      await del(a._id, token).expect(403);
    });

    it('FR-GRD-01 id không tồn tại / hỏng -> 404', async () => {
      await patch('64b000000000000000000000', staff, { name: 'x' }).expect(404);
      await del('xyz', staff).expect(404);
    });
  });

  describe('GET /classes/:id/assessments', () => {
    it('FR-GRD-01 sắp theo heldOn tăng dần; M, S, T phụ trách xem được', async () => {
      const { teacher, cls } = await teacherClass();
      await makeAssessment(t.conn, { classId: cls._id, name: 'B', weight: 10, heldOn: new Date('2026-03-01T00:00:00+07:00') });
      await makeAssessment(t.conn, { classId: cls._id, name: 'A', weight: 10, heldOn: new Date('2026-02-01T00:00:00+07:00') });
      for (const token of [staff, teacher.token, (await loginAs(t, Role.MANAGER)).token]) {
        const r = await list(cls._id, token).expect(200);
        expect(r.body.data.map((x: { name: string }) => x.name)).toEqual(['A', 'B']);
      }
    });

    it('FR-GRD-01 HV lớp mình (kể cả đã chuyển đi) -> 200, lớp khác -> 404', async () => {
      const cls = await makeClass(t.conn);
      const other = await makeClass(t.conn);
      await makeAssessment(t.conn, { classId: cls._id });
      const st = await makeStudent(t.conn, { withUser: true });
      await makeEnrollment(t.conn, { studentId: st._id, classId: cls._id, status: EnrollmentStatus.TRANSFERRED });
      const login = await t.http().post('/api/v1/auth/login').send({ username: st.code, password: DEFAULT_PASSWORD });
      const token = login.body.data.accessToken as string;
      const r = await list(cls._id, token).expect(200);
      expect(r.body.data).toHaveLength(1);
      await list(other._id, token).expect(404);
    });

    it('FR-GRD-01 GV lớp khác -> 404; ADMIN -> 403', async () => {
      const cls = await makeClass(t.conn);
      await list(cls._id, (await loginAs(t, Role.TEACHER)).token).expect(404);
      await list(cls._id, (await loginAs(t, Role.ADMIN)).token).expect(403);
    });

    it('FR-GRD-01 lớp không tồn tại -> 404', async () => {
      await list('64b000000000000000000000', staff).expect(404);
    });
  });

  describe('lockedAt / isLocked (D16)', () => {
    beforeAll(async () => {
      // gradeLockDays = 3 for the whole block; drop the in-process settings cache so it is re-read.
      await t.conn.model('Settings').updateOne({ _id: 'center' }, { gradeLockDays: 3 }, { upsert: true });
      (t.app.get(SettingsService) as unknown as { cache: null }).cache = null;
    });
    afterEach(() => t.clock.set(DEFAULT_NOW));
    async function one(heldOn: string, unlockedUntil: Date | null = null) {
      const cls = await makeClass(t.conn, { status: ClassStatus.ONGOING });
      await makeAssessment(t.conn, { classId: cls._id, heldOn: new Date(`${heldOn}T00:00:00+07:00`), unlockedUntil });
      // fresh token: the access token's iat/exp follow the (moved) fake clock
      const token = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
      return (await list(cls._id, token).expect(200)).body.data[0];
    }

    it('FR-GRD-01 lockedAt = 00:00 VN của heldOn + gradeLockDays', async () => {
      const r = await one('2026-01-03'); // lock at 2026-01-06 00:00 VN, now = 05/01 09:00 VN
      expect(r.lockedAt).toBe('2026-01-05T17:00:00.000Z');
      expect(r.isLocked).toBe(false);
      expect((await one('2026-01-02')).isLocked).toBe(true); // lock at 05/01 00:00 VN
    });

    it('FR-GRD-01 biên: 23:59 VN trước mốc chưa khóa, đúng 00:00 VN khóa', async () => {
      t.clock.set(new Date('2026-01-05T16:59:00Z')); // 23:59 VN 05/01
      expect((await one('2026-01-03')).isLocked).toBe(false);
      t.clock.set(new Date('2026-01-05T17:00:00Z')); // 00:00 VN 06/01
      expect((await one('2026-01-03')).isLocked).toBe(true);
    });

    it('FR-GRD-01 mở khóa tạm: unlockedUntil > now -> không khóa; đã hết hạn -> khóa', async () => {
      expect((await one('2026-01-01', new Date('2026-01-06T00:00:00Z'))).isLocked).toBe(false);
      expect((await one('2026-01-01', new Date('2026-01-04T00:00:00Z'))).isLocked).toBe(true);
    });
  });
});
