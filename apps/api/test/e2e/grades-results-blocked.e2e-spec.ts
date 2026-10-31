import { AssessmentType, ClassStatus, EnrollmentStatus, ErrorCode, Role } from '@lc/shared';
import { OUTSTANDING_CHECKER } from '../../src/common/contracts';
import { SettingsService } from '../../src/common/settings/settings.service';
import { makeClass, makeEnrollment } from '../factories/academic.factory';
import { makeAssessment, makeGrade } from '../factories/assessment.factory';
import { makeStudent } from '../factories/student.factory';
import { DEFAULT_PASSWORD } from '../factories/user.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-GRD-07 Chặn xem kết quả khi nợ học phí', () => {
  let t: TestApp;
  const checker = { hasOverdueBalance: jest.fn().mockResolvedValue(true) };
  beforeAll(async () => {
    t = await createTestApp({ overrides: [{ provide: OUTSTANDING_CHECKER, useValue: checker }] });
  });
  afterAll(async () => {
    await t.close();
  });

  const loginStudent = async (username: string) => {
    const res = await t.http().post('/api/v1/auth/login').send({ username, password: DEFAULT_PASSWORD });
    return { token: res.body.data.accessToken as string };
  };
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const setFlag = async (v: boolean) => {
    await t.conn.model('Settings').updateOne({ _id: 'center' }, { resultViewRequiresPaidFees: v }, { upsert: true });
    (t.app.get(SettingsService) as unknown as { cache: null }).cache = null;
  };

  async function setup() {
    const cls = await makeClass(t.conn, { status: ClassStatus.ONGOING });
    const st = await makeStudent(t.conn, { withUser: true });
    const en = await makeEnrollment(t.conn, { studentId: st._id, classId: cls._id, courseId: cls.courseId, status: EnrollmentStatus.ENROLLED });
    const a = await makeAssessment(t.conn, { classId: cls._id, type: AssessmentType.QUIZ, weight: 20, confirmedAt: new Date() });
    await makeGrade(t.conn, { assessmentId: a._id, studentId: st._id, enrollmentId: en._id, score: 8 });
    const me = await loginStudent(st.code);
    return { cls, st, me };
  }
  const tUrl = (s: { cls: { _id: unknown }; st: { _id: unknown } }) =>
    `/api/v1/results/transcript.pdf?studentId=${s.st._id}&classId=${s.cls._id}`;

  it('setting true + nợ quá hạn -> H /results 403 FEES_OUTSTANDING, transcript 403', async () => {
    await setFlag(true);
    const s = await setup();
    const r = await t.http().get('/api/v1/results').set(auth(s.me.token));
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe(ErrorCode.FEES_OUTSTANDING);
    const p = await t.http().get(tUrl(s)).set(auth(s.me.token));
    expect(p.status).toBe(403);
    expect(p.body.error.code).toBe(ErrorCode.FEES_OUTSTANDING);
  });

  it('setting true: S, M vẫn xem được', async () => {
    await setFlag(true);
    const s = await setup();
    for (const role of [Role.ACADEMIC_STAFF, Role.MANAGER]) {
      const u = await loginAs(t, role);
      expect((await t.http().get(`/api/v1/results?classId=${s.cls._id}`).set(auth(u.token))).status).toBe(200);
      expect((await t.http().get(tUrl(s)).set(auth(u.token))).status).toBe(200);
    }
  });

  it('setting false -> H xem được dù nợ', async () => {
    await setFlag(false);
    const s = await setup();
    expect((await t.http().get('/api/v1/results').set(auth(s.me.token))).status).toBe(200);
    expect((await t.http().get(tUrl(s)).set(auth(s.me.token))).status).toBe(200);
  });
});
