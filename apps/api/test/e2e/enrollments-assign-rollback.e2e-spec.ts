import { EnrollmentStatus, Role } from '@lc/shared';
import { INVOICE_CREATOR } from '../../src/common/contracts/invoice-creator';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeClass, makeCourse, makeEnrollment, makeStudent, models } from '../factories';

describe('FR-CLS-06 Xếp lớp - rollback khi tạo hóa đơn lỗi', () => {
  let t: TestApp;
  beforeAll(async () => {
    const fake = { createForEnrollment: jest.fn().mockRejectedValue(new Error('boom')), voidForEnrollment: jest.fn() };
    t = await createTestApp({ overrides: [{ provide: INVOICE_CREATOR, useValue: fake }] });
  });
  afterAll(async () => {
    await t.close();
  });

  it('createForEnrollment lỗi → 500, enrollment vẫn WAITING_CLASS, sĩ số không đổi, không thông báo', async () => {
    const staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    const c = await makeCourse(t.conn);
    const cls = await makeClass(t.conn, { courseId: c._id });
    const st = await makeStudent(t.conn, { withUser: true });
    const e = await makeEnrollment(t.conn, { studentId: st._id, courseId: c._id, status: EnrollmentStatus.WAITING_CLASS, placementLevel: 'A1' });
    await t.http().post(`/api/v1/enrollments/${e._id}/assign`).set({ Authorization: `Bearer ${staff}` }).send({ classId: cls._id.toString() }).expect(500);
    const m = models(t.conn);
    const row = await m.Enrollment.findById(e._id).lean();
    expect(row).toMatchObject({ status: EnrollmentStatus.WAITING_CLASS, classId: null });
    expect((await m.Class.findById(cls._id).lean())?.currentSize).toBe(0);
    expect(await t.conn.collection('notifications').countDocuments({ type: 'CLASS_ASSIGNED' })).toBe(0);
  });
});
