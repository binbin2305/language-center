import { ALL_ROLES, Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-SET-01 Cài đặt', () => {
  let t: TestApp;
  const tokens = {} as Record<Role, string>;
  const auth = (r: Role) => ({ Authorization: `Bearer ${tokens[r]}` });
  const patch = (r: Role, b: unknown) => t.http().patch('/api/v1/settings').set(auth(r)).send(b as object);

  beforeAll(async () => {
    t = await createTestApp();
    for (const r of ALL_ROLES) tokens[r] = (await loginAs(t, r)).token;
  });
  afterAll(async () => {
    await t.close();
  });

  it('mọi role GET → 200 với SettingsDto', async () => {
    for (const r of ALL_ROLES) {
      const res = await t.http().get('/api/v1/settings').set(auth(r)).expect(200);
      expect(res.body.data).toMatchObject({ centerName: expect.any(String), gradeLockDays: expect.any(Number) });
      expect(res.body.data._id).toBeUndefined();
    }
  });

  it('M PATCH attendanceWarningThreshold 0.3 → GET trả 0.3', async () => {
    const res = await patch(Role.MANAGER, { attendanceWarningThreshold: 0.3 }).expect(200);
    expect(res.body.data.attendanceWarningThreshold).toBe(0.3);
    const get = await t.http().get('/api/v1/settings').set(auth(Role.STUDENT)).expect(200);
    expect(get.body.data.attendanceWarningThreshold).toBe(0.3);
  });

  it('S, T, H, A PATCH → 403', async () => {
    for (const r of ALL_ROLES.filter((x) => x !== Role.MANAGER)) await patch(r, { gradeLockDays: 3 }).expect(403);
  });

  it('threshold 1.2 / -0.1 → 400; gradeLockDays 7.5 / 366 → 400, 0 → 200; field lạ → 400', async () => {
    await patch(Role.MANAGER, { attendanceWarningThreshold: 1.2 }).expect(400);
    await patch(Role.MANAGER, { attendanceWarningThreshold: -0.1 }).expect(400);
    await patch(Role.MANAGER, { gradeLockDays: 7.5 }).expect(400);
    await patch(Role.MANAGER, { gradeLockDays: 366 }).expect(400);
    const ok = await patch(Role.MANAGER, { gradeLockDays: 0 }).expect(200);
    expect(ok.body.data.gradeLockDays).toBe(0);
    await patch(Role.MANAGER, { foo: 1 }).expect(400);
  });

  it('PATCH ghi audit entity settings', async () => {
    const before = await t.conn.collection('audit_logs').countDocuments({ entity: /^settings$/i, action: 'update' });
    await patch(Role.MANAGER, { centerName: 'Trung tâm X' }).expect(200);
    const after = await t.conn.collection('audit_logs').countDocuments({ entity: /^settings$/i, action: 'update' });
    expect(after).toBe(before + 1);
  });
});
