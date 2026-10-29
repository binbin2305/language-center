import { ErrorCode, Role } from '@lc/shared';
import { makeClass, makeSession } from '../factories/academic.factory';
import { makeRoom } from '../factories/catalog.factory';
import { makeUser } from '../factories/user.factory';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-SCH-03 POST /sessions/bulk/check-conflicts (dry-run lịch lặp)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const post = (token: string, body: object) =>
    t.http().post('/api/v1/sessions/bulk/check-conflicts').set('Authorization', `Bearer ${token}`).send(body);
  const count = () => t.conn.model('Session').countDocuments();

  async function seed() {
    const teacher = await makeUser(t.conn, { role: Role.TEACHER });
    const room = await makeRoom(t.conn, { capacity: 30 });
    const cls = await makeClass(t.conn, { teacherId: teacher._id });
    return {
      teacher, room, cls,
      body: {
        classId: String(cls._id), roomId: String(room._id), teacherId: String(teacher._id),
        weekdays: [1, 3, 5], startTime: '18:00', endTime: '19:30', fromDate: '2026-01-05', toDate: '2026-01-30',
      },
    };
  }

  it('trả danh sách xung đột cho chuỗi trùng phòng, không ghi và không đổi số buổi', async () => {
    const { token } = await loginAs(t, Role.MANAGER);
    const s = await seed();
    const other = await makeClass(t.conn);
    await makeSession(t.conn, {
      classId: other._id, roomId: s.room._id,
      startAt: new Date('2026-01-07T11:00:00.000Z'), endAt: new Date('2026-01-07T12:30:00.000Z'),
    });
    const before = await count();
    const res = await post(token, s.body);
    expect(res.status).toBe(200);
    expect(res.body.data.conflicts).toHaveLength(1);
    expect(res.body.data.conflicts[0]).toMatchObject({ kind: 'ROOM', startAt: '2026-01-07T11:00:00.000Z' });
    expect(await count()).toBe(before);
  });

  it('chuỗi sạch -> conflicts rỗng (ACADEMIC_STAFF)', async () => {
    const { token } = await loginAs(t, Role.ACADEMIC_STAFF);
    const s = await seed();
    const before = await count();
    const res = await post(token, s.body);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ conflicts: [] });
    expect(await count()).toBe(before);
  });

  it('ngoài khoảng lớp -> 422 SESSION_OUTSIDE_CLASS_RANGE', async () => {
    const { token } = await loginAs(t, Role.MANAGER);
    const s = await seed();
    const res = await post(token, { ...s.body, fromDate: '2025-12-01' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe(ErrorCode.SESSION_OUTSIDE_CLASS_RANGE);
  });

  it.each([Role.TEACHER, Role.STUDENT, Role.ADMIN])('%s -> 403', async (role) => {
    const { token } = await loginAs(t, role);
    const s = await seed();
    expect((await post(token, s.body)).status).toBe(403);
  });
});
