import { Types } from 'mongoose';
import { AttendanceStatus, Role } from '@lc/shared';
import { runMigrateAttendanceStartAt } from '../../scripts/migrate-attendance-start-at';
import { makeClass, makeSession, makeStudent } from '../factories';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-ATT-04 R12 backfill attendance.startAt', () => {
  let t: TestApp;
  const raw = () => t.conn.collection('attendances');

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  /** Pre-R12 row: written straight to the collection, no startAt. */
  async function legacy(sessionId: Types.ObjectId, classId: Types.ObjectId, over: Record<string, unknown> = {}): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    const at = new Date('2025-12-01T02:00:00Z');
    await raw().insertOne({
      _id,
      sessionId,
      classId,
      studentId: (await makeStudent(t.conn))._id,
      enrollmentId: new Types.ObjectId(),
      status: AttendanceStatus.PRESENT,
      history: [],
      createdAt: at,
      updatedAt: at,
      ...over,
    });
    return _id;
  }

  it('bản ghi thiếu startAt → = session.startAt, updatedAt không đổi; chạy lại → updated 0', async () => {
    const se = await makeSession(t.conn, { startAt: new Date('2026-01-07T11:00:00Z'), endAt: new Date('2026-01-07T13:00:00Z') });
    const a = await legacy(se._id, se.classId);
    const b = await legacy(se._id, se.classId);
    const first = await runMigrateAttendanceStartAt(t.conn, { batchSize: 1 });
    expect(first.updated).toBeGreaterThanOrEqual(2);
    for (const id of [a, b]) {
      const row = await raw().findOne({ _id: id });
      expect(row?.startAt).toEqual(se.startAt);
      expect(row?.updatedAt).toEqual(new Date('2025-12-01T02:00:00Z'));
    }
    expect(await runMigrateAttendanceStartAt(t.conn)).toMatchObject({ updated: 0 });
  });

  it('bản ghi có startAt lệch với buổi → sửa theo session.startAt', async () => {
    const se = await makeSession(t.conn, { startAt: new Date('2026-01-08T11:00:00Z'), endAt: new Date('2026-01-08T13:00:00Z') });
    const id = await legacy(se._id, se.classId, { startAt: new Date('2026-01-01T00:00:00Z') });
    await runMigrateAttendanceStartAt(t.conn);
    expect((await raw().findOne({ _id: id }))?.startAt).toEqual(se.startAt);
  });

  it('bản ghi mồ côi (buổi không tồn tại) → bỏ qua, đếm orphans', async () => {
    const id = await legacy(new Types.ObjectId(), new Types.ObjectId());
    const res = await runMigrateAttendanceStartAt(t.conn);
    expect(res.orphans).toBeGreaterThanOrEqual(1);
    expect((await raw().findOne({ _id: id }))?.startAt).toBeUndefined();
  });

  it('dữ liệu kiểu cũ sau migrate hiện trong GET /attendance?from&to', async () => {
    const cls = await makeClass(t.conn);
    const se = await makeSession(t.conn, { classId: cls._id, startAt: new Date('2026-02-10T11:00:00Z'), endAt: new Date('2026-02-10T13:00:00Z') });
    await legacy(se._id, cls._id);
    await runMigrateAttendanceStartAt(t.conn);
    const { token } = await loginAs(t, Role.ACADEMIC_STAFF);
    const res = await t.http().get(`/api/v1/attendance?classId=${cls._id}&from=2026-02-10&to=2026-02-10`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].sessionStartAt).toBe('2026-02-10T11:00:00.000Z');
  });
});
