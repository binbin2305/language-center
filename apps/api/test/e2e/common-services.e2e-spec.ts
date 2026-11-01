import { Types } from 'mongoose';
import { EnrollmentStatus, NotificationType, Role } from '@lc/shared';
import { AuditService } from '../../src/common/audit/audit.service';
import { AuthUser } from '../../src/common/auth/auth-user';
import { CounterService } from '../../src/common/db/counter.service';
import { withTransaction } from '../../src/common/db/transaction';
import { NotificationsService } from '../../src/common/notifications/notifications.service';
import { paginate } from '../../src/common/pagination';
import { ScopeService } from '../../src/common/scope/scope.service';
import { SettingsService } from '../../src/common/settings/settings.service';
import { Models } from '../../src/database/models';
import { Settings } from '../../src/database/schemas/settings.schema';
import { AuditLog } from '../../src/database/schemas/audit-log.schema';
import { makeClass, makeEnrollment, makeLead, makeSession, makeStudent, makeTeacher, makeUser, models } from '../factories';
import { createTestApp, DEFAULT_NOW, TestApp } from '../helpers/test-app';

const ids = (a: Types.ObjectId[]) => a.map(String).sort();

describe('common services', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  describe('withTransaction', () => {
    it('rollback khi throw sau insert', async () => {
      await expect(
        withTransaction(t.conn, async (s) => {
          await models(t.conn).Room.create([{ code: 'TX-ROLL', name: 'x', capacity: 5 }], { session: s });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await models(t.conn).Room.countDocuments({ code: 'TX-ROLL' })).toBe(0);
    });
    it('commit và trả giá trị', async () => {
      const v = await withTransaction(t.conn, async (s) => {
        await models(t.conn).Room.create([{ code: 'TX-OK', name: 'x', capacity: 5 }], { session: s });
        return 42;
      });
      expect(v).toBe(42);
      expect(await models(t.conn).Room.countDocuments({ code: 'TX-OK' })).toBe(1);
    });
  });

  describe('CounterService', () => {
    it('50 lời gọi song song cho {1..50}', async () => {
      const c = t.app.get(CounterService);
      const out = await Promise.all(Array.from({ length: 50 }, () => c.next('student:2026')));
      expect(new Set(out)).toEqual(new Set(Array.from({ length: 50 }, (_, i) => i + 1)));
    });
    it('20 transaction song song, key mới -> {1..20}', async () => {
      const c = t.app.get(CounterService);
      const out = await Promise.all(Array.from({ length: 20 }, () => withTransaction(t.conn, (s) => c.next('txfresh:key', s))));
      expect(new Set(out)).toEqual(new Set(Array.from({ length: 20 }, (_, i) => i + 1)));
    });
    it('20 transaction song song, key đã có sẵn -> {2..21}', async () => {
      const c = t.app.get(CounterService);
      await c.next('txseed:key');
      const out = await Promise.all(Array.from({ length: 20 }, () => withTransaction(t.conn, (s) => c.next('txseed:key', s))));
      expect(new Set(out)).toEqual(new Set(Array.from({ length: 20 }, (_, i) => i + 2)));
    });
    it('formatCode', () => {
      expect(t.app.get(CounterService).formatCode('HV', '2026', 42, 5)).toBe('HV202600042');
    });
    it('next trong transaction rollback thì không tiêu số', async () => {
      const c = t.app.get(CounterService);
      await withTransaction(t.conn, (s) => c.next('tx:key', s));
      await expect(
        withTransaction(t.conn, async (s) => {
          await c.next('tx:key', s);
          throw new Error('x');
        }),
      ).rejects.toThrow();
      expect(await c.next('tx:key')).toBe(2);
    });
  });

  describe('AuditService', () => {
    it('ghi audit log với actor, thời gian từ clock', async () => {
      const admin = await makeUser(t.conn);
      const actor: AuthUser = { id: admin._id, role: Role.ADMIN };
      const entityId = new Types.ObjectId();
      await t.app.get(AuditService).log({ actor, action: 'create', entity: 'Room', entityId, after: { a: 1 } });
      const row = await t.conn.model<AuditLog>(Models.AuditLog).findOne({ entityId }).lean();
      expect(row).toMatchObject({ action: 'create', entity: 'Room', actorRole: Role.ADMIN, after: { a: 1 } });
      expect(String(row?.actorId)).toBe(String(admin._id));
      expect(row?.at.toISOString()).toBe(t.clock.now().toISOString());
    });
  });

  describe('AuditService redaction', () => {
    it('loại passwordHash/tokenHash khỏi before/after', async () => {
      const admin = await makeUser(t.conn);
      const entityId = new Types.ObjectId();
      await t.app.get(AuditService).log({
        actor: { id: admin._id, role: Role.ADMIN }, action: 'update', entity: 'User', entityId,
        before: { passwordHash: 'x', n: { tokenHash: 'y', k: 1 } }, after: { passwordHash: 'z', a: 1 },
      });
      const row = await t.conn.model<AuditLog>(Models.AuditLog).findOne({ entityId }).lean();
      expect(row?.before).toEqual({ n: { k: 1 } });
      expect(row?.after).toEqual({ a: 1 });
    });
  });

  describe('NotificationsService', () => {
    it('bỏ trùng userId', async () => {
      const u1 = new Types.ObjectId();
      const u2 = new Types.ObjectId();
      await t.app.get(NotificationsService).notify([u1, u1, u2], {
        type: NotificationType.SESSION_CREATED, title: 'T', body: 'B',
      });
      expect(await t.conn.model(Models.Notification).countDocuments({ userId: { $in: [u1, u2] } })).toBe(2);
    });
    it('danh sách rỗng không làm gì', async () => {
      await expect(
        t.app.get(NotificationsService).notify([], { type: NotificationType.SESSION_CREATED, title: 'T', body: 'B' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('SettingsService', () => {
    it('lần đầu tạo mặc định, an toàn khi gọi song song; update ghi audit và xóa cache', async () => {
      const s = t.app.get(SettingsService);
      const all = await Promise.all([s.get(), s.get(), s.get()]);
      expect(all[0]).toMatchObject({
        attendanceWarningThreshold: 0.2, gradeLockDays: 14, resultViewRequiresPaidFees: false,
        teacherAttendanceEditDays: 7, invoiceDueDaysAfterStart: 7,
      });
      expect(await t.conn.model(Models.Settings).countDocuments()).toBe(1);

      const admin = await makeUser(t.conn);
      const updated = await s.update({ gradeLockDays: 30 }, { id: admin._id, role: Role.ADMIN });
      expect(updated.gradeLockDays).toBe(30);
      expect((await s.get()).gradeLockDays).toBe(30);
      expect(await t.conn.model(Models.AuditLog).countDocuments({ entity: 'Settings', action: 'update' })).toBe(1);
    });
  });

  describe('SettingsService cache race', () => {
    it('get() bắt đầu trước update nhưng resolve sau không ghi đè cache bằng dữ liệu cũ', async () => {
      const svc = t.app.get(SettingsService);
      const model = t.conn.model<Settings>(Models.Settings);
      await svc.get();
      const stale = await model.findById('center').lean();
      (svc as unknown as { cache: Settings | null }).cache = null;
      let release!: (v: Settings | null) => void;
      const deferred = new Promise<Settings | null>((r) => (release = r));
      const spy = jest
        .spyOn(model, 'findOneAndUpdate')
        .mockImplementationOnce((() => ({ lean: () => ({ catch: () => deferred }) })) as unknown as typeof model.findOneAndUpdate);
      const pending = svc.get();
      spy.mockRestore();
      const admin = await makeUser(t.conn);
      await svc.update({ gradeLockDays: 99 }, { id: admin._id, role: Role.ADMIN });
      release(stale);
      await pending;
      expect((await svc.get()).gradeLockDays).toBe(99);
    });
  });

  describe('ScopeService', () => {
    it('trợ giảng có lớp trong teacherClassIds (mọi trạng thái lớp)', async () => {
      const scope = t.app.get(ScopeService);
      const ta = await makeTeacher(t.conn);
      const main = await makeTeacher(t.conn);
      const cls = await makeClass(t.conn, { teacherId: main._id, assistantTeacherId: ta._id });
      expect(ids(await scope.teacherClassIds(ta._id))).toEqual([String(cls._id)]);
      expect(ids(await scope.teacherClassIds(main._id))).toEqual([String(cls._id)]);
    });
    it('GV dạy thay: take attendance true nhưng lớp không trong teacherClassIds', async () => {
      const scope = t.app.get(ScopeService);
      const sub = await makeTeacher(t.conn);
      const cls = await makeClass(t.conn);
      const sess = await makeSession(t.conn, { classId: cls._id, teacherId: sub._id });
      expect(await scope.teacherClassIds(sub._id)).toEqual([]);
      expect(await scope.teacherCanTakeAttendance(sub._id, sess)).toBe(true);
      expect(await scope.teacherCanTakeAttendance(new Types.ObjectId(), sess)).toBe(false);
      expect(await scope.teacherCanTakeAttendance(cls.teacherId, sess)).toBe(true);
    });
    it('HV TRANSFERRED: lớp có trong history, không trong current', async () => {
      const scope = t.app.get(ScopeService);
      const st = await makeStudent(t.conn);
      const old = await makeClass(t.conn);
      const cur = await makeClass(t.conn);
      await makeEnrollment(t.conn, { studentId: st._id, classId: old._id, status: EnrollmentStatus.TRANSFERRED });
      await makeEnrollment(t.conn, { studentId: st._id, classId: cur._id, status: EnrollmentStatus.ENROLLED });
      await makeEnrollment(t.conn, { studentId: st._id, classId: null, status: EnrollmentStatus.WAITING_CLASS });
      expect(ids(await scope.studentClassIds(st._id, 'history'))).toEqual(ids([old._id, cur._id]));
      expect(ids(await scope.studentClassIds(st._id, 'current'))).toEqual([String(cur._id)]);
    });
    it('teacherStudentIds: ENROLLED, COMPLETED hoặc TRANSFERRED (R7), bỏ trùng; CANCELLED/RESERVED không', async () => {
      const scope = t.app.get(ScopeService);
      const teacher = await makeTeacher(t.conn);
      const cls = await makeClass(t.conn, { teacherId: teacher._id });
      const a = await makeStudent(t.conn);
      const b = await makeStudent(t.conn);
      const c = await makeStudent(t.conn);
      await makeEnrollment(t.conn, { studentId: a._id, classId: cls._id, status: EnrollmentStatus.ENROLLED });
      await makeEnrollment(t.conn, { studentId: a._id, classId: cls._id, status: EnrollmentStatus.COMPLETED });
      await makeEnrollment(t.conn, { studentId: b._id, classId: cls._id, status: EnrollmentStatus.COMPLETED });
      await makeEnrollment(t.conn, { studentId: c._id, classId: cls._id, status: EnrollmentStatus.TRANSFERRED });
      const d = await makeStudent(t.conn);
      await makeEnrollment(t.conn, { studentId: d._id, classId: cls._id, status: EnrollmentStatus.CANCELLED });
      await makeEnrollment(t.conn, { studentId: d._id, classId: cls._id, status: EnrollmentStatus.RESERVED });
      expect(ids(await scope.teacherStudentIds(teacher._id))).toEqual(ids([a._id, b._id, c._id]));
    });
  });

  describe('paginate', () => {
    it('meta.total đúng, sort mặc định -createdAt, trang/limit', async () => {
      const marker = 'PAGINATE';
      for (let i = 0; i < 5; i++) {
        await models(t.conn).Room.create({ code: `${marker}-${i}`, name: `n${i}`, capacity: 5 });
      }
      const Room = models(t.conn).Room;
      const r = await paginate(Room, { code: /^PAGINATE-/ }, { page: 2, limit: 2 });
      expect(r.meta).toEqual({ page: 2, limit: 2, total: 5 });
      expect(r.data).toHaveLength(2);
      const asc = await paginate(Room, { code: /^PAGINATE-/ }, { page: 1, limit: 10, sort: 'code' }, { code: 1 });
      expect(asc.data.map((d) => d.code)).toEqual([0, 1, 2, 3, 4].map((i) => `PAGINATE-${i}`));
    });
  });

  describe('timestamps theo ClockService', () => {
    it('createdAt/updatedAt lấy từ FakeClock; tiến đồng hồ ảnh hưởng updatedAt', async () => {
      t.clock.set(DEFAULT_NOW);
      const lead = await makeLead(t.conn);
      expect(lead.get('createdAt')).toEqual(DEFAULT_NOW);
      expect(lead.get('updatedAt')).toEqual(DEFAULT_NOW);

      t.clock.advance(60 * 60_000);
      const later = t.clock.now();
      const viaUpdate = await models(t.conn).Lead.findOneAndUpdate({ _id: lead._id }, { note: 'x' }, { new: true });
      expect(viaUpdate?.get('updatedAt')).toEqual(later);
      expect(viaUpdate?.get('createdAt')).toEqual(DEFAULT_NOW);

      t.clock.advance(60_000);
      lead.note = 'y';
      await lead.save();
      expect(lead.get('updatedAt')).toEqual(t.clock.now());
      t.clock.set(DEFAULT_NOW);
    });
    it('mọi schema dùng clockTimestamps (currentTime = ClockService)', () => {
      for (const model of Object.values(t.conn.models)) {
        const ts = model.schema.get('timestamps') as { currentTime?: () => Date } | undefined;
        expect([model.modelName, typeof ts?.currentTime]).toEqual([model.modelName, 'function']);
        expect([model.modelName, ts?.currentTime?.()]).toEqual([model.modelName, t.clock.now()]);
      }
    });
  });

  describe('Student.fullNameSearch', () => {
    it('được tính lại khi cập nhật fullName qua findOneAndUpdate / updateOne ($set hoặc dạng phẳng)', async () => {
      const Student = models(t.conn).Student;
      const st = await makeStudent(t.conn, { fullName: 'Nguyễn Văn An' });
      expect(st.fullNameSearch).toBe('nguyen van an');

      await Student.findOneAndUpdate({ _id: st._id }, { $set: { fullName: 'Trần Thị Bích' } });
      expect((await Student.findById(st._id))?.fullNameSearch).toBe('tran thi bich');

      await Student.updateOne({ _id: st._id }, { fullName: 'Lê Đức Mạnh' });
      expect((await Student.findById(st._id))?.fullNameSearch).toBe('le duc manh');

      await Student.findByIdAndUpdate(st._id, { fullName: 'Phạm Ánh' }, { new: true });
      expect((await Student.findById(st._id))?.fullNameSearch).toBe('pham anh');

      await Student.updateOne({ _id: st._id }, { $set: { note: 'không đổi tên' } });
      expect((await Student.findById(st._id))?.fullNameSearch).toBe('pham anh');
    });
  });
});
