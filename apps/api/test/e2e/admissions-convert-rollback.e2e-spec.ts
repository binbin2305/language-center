import { Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { makeCourse, makeLead } from '../factories';
import { Models } from '../../src/database/models';
import { EnrollmentsService } from '../../src/modules/enrollments/enrollments.service';

describe('FR-ADM-03 Tạo hồ sơ từ lead — nguyên tử', () => {
  let t: TestApp;
  let staff: string;

  beforeAll(async () => {
    t = await createTestApp({
      overrides: [
        {
          provide: EnrollmentsService,
          useValue: {
            createPending: () => {
              throw new Error('boom');
            },
          },
        },
      ],
    });
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
  });
  afterAll(async () => {
    await t.close();
  });

  it('createPending lỗi → 500 INTERNAL, không còn student/user, lead vẫn NEW', async () => {
    const course = await makeCourse(t.conn);
    const lead = await makeLead(t.conn, { interestedCourseId: course._id });
    const usersBefore = await t.conn.model(Models.User).countDocuments({ role: 'STUDENT' });
    const res = await t
      .http()
      .post(`/api/v1/leads/${lead._id}/convert`)
      .set({ Authorization: `Bearer ${staff}` })
      .send()
      .expect(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(await t.conn.model(Models.Student).countDocuments({ leadId: lead._id })).toBe(0);
    expect(await t.conn.model(Models.User).countDocuments({ role: 'STUDENT' })).toBe(usersBefore);
    const stored = await t.conn.model(Models.Lead).findById(lead._id).lean();
    expect(stored).toMatchObject({ status: 'NEW', studentId: null });
  });
});
