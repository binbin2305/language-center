import { Types } from 'mongoose';
import { NotificationType, Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { Models } from '../../src/database/models';
import { Notification } from '../../src/database/schemas/notification.schema';

describe('FR-NTF-01 notifications API', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  const seed = (userId: Types.ObjectId, title: string) =>
    t.conn.model<Notification>(Models.Notification).create({ userId, type: NotificationType.CLASS_ASSIGNED, title, body: 'b' });
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('chỉ thấy thông báo của mình, đếm chưa đọc, đọc, đọc tất cả', async () => {
    const a = await loginAs(t, Role.STUDENT);
    const b = await loginAs(t, Role.TEACHER);
    const n1 = await seed(a.user._id, 'a1');
    await seed(a.user._id, 'a2');
    const nb = await seed(b.user._id, 'b1');

    const list = await t.http().get('/api/v1/notifications').set(auth(a.token)).expect(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.meta).toMatchObject({ total: 2 });
    expect(list.body.data[0]).toMatchObject({ type: 'CLASS_ASSIGNED', readAt: null });
    expect(typeof list.body.data[0].id).toBe('string');
    expect(list.body.data[0].userId).toBeUndefined();

    const c1 = await t.http().get('/api/v1/notifications/unread-count').set(auth(a.token)).expect(200);
    expect(c1.body.data).toEqual({ count: 2 });

    const r = await t.http().post(`/api/v1/notifications/${n1._id}/read`).set(auth(a.token)).expect(200);
    expect(r.body.data.readAt).toBe(t.clock.now().toISOString());
    expect((await t.http().get('/api/v1/notifications/unread-count').set(auth(a.token))).body.data.count).toBe(1);
    const unread = await t.http().get('/api/v1/notifications?unread=true').set(auth(a.token)).expect(200);
    expect(unread.body.data).toHaveLength(1);

    const other = await t.http().post(`/api/v1/notifications/${nb._id}/read`).set(auth(a.token)).expect(404);
    expect(other.body.error.code).toBe('NOT_FOUND');
    await t.http().post(`/api/v1/notifications/${new Types.ObjectId()}/read`).set(auth(a.token)).expect(404);
    await t.http().post('/api/v1/notifications/not-an-id/read').set(auth(a.token)).expect(404);

    await t.http().post('/api/v1/notifications/read-all').set(auth(a.token)).expect(200);
    expect((await t.http().get('/api/v1/notifications/unread-count').set(auth(a.token))).body.data.count).toBe(0);
    expect((await t.http().get('/api/v1/notifications/unread-count').set(auth(b.token))).body.data.count).toBe(1);
  });

  it('yêu cầu đăng nhập', async () => {
    await t.http().get('/api/v1/notifications').expect(401);
  });
});
