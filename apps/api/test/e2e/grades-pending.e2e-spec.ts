import { Role } from '@lc/shared';
import { makeClass } from '../factories/academic.factory';
import { makeAssessment } from '../factories/assessment.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

// DEFAULT_NOW = 2026-01-05 09:00 VN, gradeLockDays default 14.
const vn = (d: string) => new Date(`${d}T00:00:00+07:00`);

describe('FR-GRD-02 Bài chưa xác nhận của giáo viên (GET /assessments/pending)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const pending = (token: string) => t.http().get('/api/v1/assessments/pending').set({ Authorization: `Bearer ${token}` });

  it('FR-GRD-02 GV thấy bài chưa xác nhận của lớp mình (cả trợ giảng), không thấy bài đã confirm / đã khóa / heldOn tương lai / lớp khác', async () => {
    const teacher = await loginAs(t, Role.TEACHER);
    const mainCls = await makeClass(t.conn, { teacherId: teacher.user._id });
    const assistCls = await makeClass(t.conn, { assistantTeacherId: teacher.user._id });
    const otherCls = await makeClass(t.conn);

    const later = await makeAssessment(t.conn, { classId: mainCls._id, name: 'Sau', heldOn: vn('2026-01-05') });
    const earlier = await makeAssessment(t.conn, { classId: assistCls._id, name: 'Trước', heldOn: vn('2026-01-02') });
    await makeAssessment(t.conn, { classId: mainCls._id, name: 'Đã xác nhận', heldOn: vn('2026-01-03'), confirmedAt: new Date('2026-01-04T00:00:00Z') });
    await makeAssessment(t.conn, { classId: mainCls._id, name: 'Đã khóa', heldOn: vn('2025-12-01') });
    await makeAssessment(t.conn, { classId: mainCls._id, name: 'Tương lai', heldOn: vn('2026-01-06') });
    await makeAssessment(t.conn, { classId: otherCls._id, name: 'Lớp khác', heldOn: vn('2026-01-02') });

    const r = await pending(teacher.token);
    expect(r.status).toBe(200);
    expect(r.body.data.map((a: { id: string }) => a.id)).toEqual([String(earlier._id), String(later._id)]);
    expect(r.body.data[0]).toMatchObject({
      classId: String(assistCls._id), classCode: assistCls.code, className: assistCls.name, isLocked: false, confirmedAt: null,
    });
  });

  it('FR-GRD-02 GV chưa có lớp -> data rỗng', async () => {
    const r = await pending((await loginAs(t, Role.TEACHER)).token);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ data: [] });
  });

  it.each([Role.MANAGER, Role.ACADEMIC_STAFF, Role.STUDENT, Role.ADMIN])('FR-GRD-02 %s -> 403', async (role) => {
    await pending((await loginAs(t, role)).token).expect(403);
  });

  it('FR-GRD-02 không đăng nhập -> 401', async () => {
    await t.http().get('/api/v1/assessments/pending').expect(401);
  });
});
