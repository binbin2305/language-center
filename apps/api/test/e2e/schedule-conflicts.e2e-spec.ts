import { Types } from 'mongoose';
import { PlacementStatus, SessionStatus } from '@lc/shared';
import { SCHEDULE_CONFLICT_CHECKER, ScheduleConflictChecker } from '../../src/common/contracts/schedule-conflict-checker';
import { MongoScheduleConflictChecker } from '../../src/modules/schedule/conflict-checker';
import { ScheduleModule } from '../../src/modules/schedule/schedule.module';
import { makeClass, makePlacementTest, makeSession } from '../factories/academic.factory';
import { makeRoom } from '../factories/catalog.factory';
import { makeUser } from '../factories/user.factory';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('FR-SCH-03 / FR-PLT-02 Conflict checker (Mongo)', () => {
  let t: TestApp;
  let checker: ScheduleConflictChecker;
  beforeAll(async () => {
    t = await createTestApp();
    checker = t.app.select(ScheduleModule).get<ScheduleConflictChecker>(SCHEDULE_CONFLICT_CHECKER, { strict: true });
  });
  afterAll(async () => {
    await t.close();
  });

  const at = (hhmm: string) => new Date(`2026-02-02T${hhmm}:00+07:00`);

  async function seed() {
    const room = await makeRoom(t.conn);
    const teacher = await makeUser(t.conn);
    const cls = await makeClass(t.conn, { teacherId: teacher._id });
    return { room, teacher, cls };
  }
  const query = (roomId: Types.ObjectId, teacherId: Types.ObjectId, s = '18:00', e = '19:30') => ({
    roomId,
    teacherId,
    startAt: at(s),
    endAt: at(e),
  });

  it('ScheduleModule cung cấp MongoScheduleConflictChecker', () => {
    expect(checker).toBeInstanceOf(MongoScheduleConflictChecker);
  });

  it('t.app.get(token, { strict: false }) resolve tới bản thực thi', () => {
    const appLevel = t.app.get(SCHEDULE_CONFLICT_CHECKER, { strict: false });
    expect(appLevel).toBeInstanceOf(MongoScheduleConflictChecker);
  });

  it('conflict có classCode và trả ISO 18:00 VN = 11:00Z', async () => {
    const { room, teacher, cls } = await seed();
    const s = await makeSession(t.conn, { classId: cls._id, roomId: room._id, teacherId: teacher._id, startAt: at('18:00'), endAt: at('19:30') });
    const res = await checker.findConflicts(query(room._id, teacher._id));
    expect(res.map((r) => r.kind).sort()).toEqual(['ROOM', 'TEACHER']);
    expect(res[0]).toMatchObject({
      sessionId: String(s._id),
      classId: String(cls._id),
      classCode: cls.code,
      startAt: '2026-02-02T11:00:00.000Z',
      endAt: '2026-02-02T12:30:00.000Z',
    });
  });

  it('buổi liền kề 19:30 không xung đột', async () => {
    const { room, teacher, cls } = await seed();
    await makeSession(t.conn, { classId: cls._id, roomId: room._id, teacherId: teacher._id, startAt: at('19:30'), endAt: at('21:00') });
    expect(await checker.findConflicts(query(room._id, teacher._id))).toEqual([]);
  });

  it('buổi CANCELLED bỏ qua', async () => {
    const { room, teacher, cls } = await seed();
    await makeSession(t.conn, {
      classId: cls._id, roomId: room._id, teacherId: teacher._id, startAt: at('18:00'), endAt: at('19:30'),
      status: SessionStatus.CANCELLED, cancelReason: 'nghỉ',
    });
    expect(await checker.findConflicts(query(room._id, teacher._id))).toEqual([]);
  });

  it('excludeSessionId loại chính nó', async () => {
    const { room, teacher, cls } = await seed();
    const s = await makeSession(t.conn, { classId: cls._id, roomId: room._id, teacherId: teacher._id, startAt: at('18:00'), endAt: at('19:30') });
    expect(await checker.findConflicts({ ...query(room._id, teacher._id), excludeSessionId: s._id })).toEqual([]);
  });

  it('placement test SCHEDULED cùng phòng -> conflict có placementTestId', async () => {
    const { room } = await seed();
    const otherTeacher = await makeUser(t.conn);
    const pt = await makePlacementTest(t.conn, { roomId: room._id, teacherId: otherTeacher._id, startAt: at('18:30'), endAt: at('20:00') });
    const me = await makeUser(t.conn);
    const res = await checker.findConflicts(query(room._id, me._id));
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ placementTestId: String(pt._id), kind: 'ROOM' });
    expect(res[0].sessionId).toBeUndefined();
  });

  it('placement test status khác SCHEDULED bỏ qua', async () => {
    const { room, teacher } = await seed();
    for (const status of [PlacementStatus.COMPLETED, PlacementStatus.CANCELLED]) {
      await makePlacementTest(t.conn, { roomId: room._id, teacherId: teacher._id, startAt: at('18:00'), endAt: at('19:30'), status });
    }
    expect(await checker.findConflicts(query(room._id, teacher._id))).toEqual([]);
  });

  it('excludePlacementTestId loại chính nó', async () => {
    const { room, teacher } = await seed();
    const pt = await makePlacementTest(t.conn, { roomId: room._id, teacherId: teacher._id, startAt: at('18:00'), endAt: at('19:30') });
    expect(await checker.findConflicts({ ...query(room._id, teacher._id), excludePlacementTestId: pt._id })).toEqual([]);
  });
});
