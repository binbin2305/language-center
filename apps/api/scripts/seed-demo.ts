import '../src/config/load-dotenv';
import 'reflect-metadata';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  AssessmentType,
  ClassDto,
  CourseDto,
  RoomDto,
  AttendanceStatus,
  ClassStatus,
  EnrollmentStatus,
  Gender,
  PaymentMethod,
  Role,
  SessionStatus,
  addVnDays,
  startOfVnDay,
  vnDateTime,
} from '@lc/shared';
import { AppModule } from '../src/app.module';
import { AuthUser } from '../src/common/auth/auth-user';
import { ClockService } from '../src/common/clock/clock.service';
import { Models } from '../src/database/models';
import { hashPassword } from '../src/modules/auth/password';
import { ConvertService } from '../src/modules/admissions/convert.service';
import { LeadsService } from '../src/modules/admissions/leads.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { ClassesService } from '../src/modules/classes/classes.service';
import { CoursesService } from '../src/modules/courses/courses.service';
import { AssignmentService } from '../src/modules/enrollments/assignment.service';
import { EnrollmentsService } from '../src/modules/enrollments/enrollments.service';
import { PaymentsService } from '../src/modules/fees/payments.service';
import { GradesService } from '../src/modules/grades/grades.service';
import { PlacementService } from '../src/modules/placement/placement.service';
import { RoomsService } from '../src/modules/rooms/rooms.service';
import { ScheduleService } from '../src/modules/schedule/schedule.service';
import { UsersService } from '../src/modules/users/users.service';

/**
 * Demo data (BACKEND_SCHEMA §4, D28) built by calling the real services inside a Nest application
 * context while a controlled clock walks from June 2026 to DEMO_TODAY: leads are converted, placed,
 * assigned (classHistory + class-stamped history, InvoiceCreator), sessions are bulk-created,
 * attendance and grades are taken after the fact, payments recorded, one class finished.
 * Only the demo passwords are set directly (the services issue random temporary passwords).
 * Usage: pnpm --filter api seed:demo [--reset]
 */
export const DEMO_PASSWORD = 'Password1';
/** A Monday: four weeks of classes are in the past, sessions run today. */
export const DEMO_TODAY = '2026-11-02';
const ADMIN_EMAIL = 'admin@center.local';

export interface SeedDemoOptions {
  reset?: boolean;
  /** Clock to drive (tests pass their FakeClock); otherwise the app's ClockService is patched. */
  clock?: { set(d: Date): void };
}

/** Deterministic PRNG so every run produces the same data. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ'];
const MIDDLE = ['Văn', 'Thị', 'Minh', 'Ngọc', 'Thanh', 'Đức', 'Thu', 'Quang', 'Hải', 'Bảo'];
const FIRST = ['An', 'Bình', 'Châm', 'Dũng', 'Giang', 'Hà', 'Huy', 'Khánh', 'Linh', 'Mai', 'Nam', 'Phương', 'Quân', 'Sơn', 'Trang', 'Tuấn', 'Vy', 'Yến'];
const ADDRESSES = ['Cầu Giấy, Hà Nội', 'Đống Đa, Hà Nội', 'Thanh Xuân, Hà Nội', 'Hai Bà Trưng, Hà Nội', 'Hoàng Mai, Hà Nội'];

const pad = (n: number, w: number) => String(n).padStart(w, '0');
const at = (d: string, hm: string) => vnDateTime(d, hm);
const str = (x: Types.ObjectId | string) => String(x);

/** Timed actions run in time order (ties in insertion order); an action may schedule later ones. */
class Timeline {
  private items: { at: Date; seq: number; run: () => Promise<void> }[] = [];
  private seq = 0;
  constructor(private readonly setNow: (d: Date) => void) {}
  add(when: Date, run: () => Promise<void>): void {
    this.items.push({ at: when, seq: this.seq++, run });
  }
  async drain(): Promise<void> {
    while (this.items.length) {
      this.items.sort((a, b) => a.at.getTime() - b.at.getTime() || a.seq - b.seq);
      const next = this.items.shift()!;
      this.setNow(next.at);
      await next.run();
    }
  }
}

function clockSetter(app: INestApplicationContext, given?: { set(d: Date): void }): (d: Date) => void {
  if (given) return (d) => given.set(d);
  const clock = app.get(ClockService);
  let current = clock.now();
  // The app's single ClockService instance also drives Mongoose timestamps (clockHolder).
  clock.now = () => new Date(current.getTime());
  return (d) => {
    current = new Date(d.getTime());
  };
}

async function resetDemo(conn: Connection): Promise<void> {
  for (const [name, coll] of Object.entries(conn.collections)) {
    if (name === 'settings') continue;
    if (name === conn.models[Models.User].collection.collectionName) await coll.deleteMany({ role: { $ne: Role.ADMIN } });
    else await coll.deleteMany({});
  }
}

export async function runSeedDemo(app: INestApplicationContext, opts: SeedDemoOptions = {}): Promise<{ status: 'created' | 'exists' }> {
  const conn = app.get<Connection>(getConnectionToken());
  const setNow = clockSetter(app, opts.clock);
  const today = at(DEMO_TODAY, '09:00');
  if (opts.reset) await resetDemo(conn);
  const User = conn.models[Models.User] as Model<{ role: string; username: string }>;
  if (await User.exists({ username: 'manager@center.local' })) {
    setNow(today);
    return { status: 'exists' };
  }

  const svc = {
    users: app.get(UsersService),
    courses: app.get(CoursesService),
    rooms: app.get(RoomsService),
    leads: app.get(LeadsService),
    convert: app.get(ConvertService),
    placement: app.get(PlacementService),
    classes: app.get(ClassesService),
    enrollments: app.get(EnrollmentsService),
    assignment: app.get(AssignmentService),
    schedule: app.get(ScheduleService),
    attendance: app.get(AttendanceService),
    grades: app.get(GradesService),
    payments: app.get(PaymentsService),
  };
  const Session = conn.models[Models.Session] as Model<{ _id: Types.ObjectId; classId: Types.ObjectId; teacherId: Types.ObjectId; startAt: Date; endAt: Date; status: string }>;
  const Enrollment = conn.models[Models.Enrollment] as Model<{ _id: Types.ObjectId; studentId: Types.ObjectId; classId: Types.ObjectId | null; status: string; invoiceId: Types.ObjectId | null }>;

  const rand = rng(2026);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const tl = new Timeline(setNow);
  const demoUserIds: Types.ObjectId[] = [];

  // --- Accounts, catalog, classes (2026-06-01) ----------------------------------------
  setNow(at('2026-06-01', '08:00'));
  let admin = await User.findOne({ role: Role.ADMIN }).lean();
  if (!admin) {
    const [created] = await User.create([
      { username: ADMIN_EMAIL, email: ADMIN_EMAIL, fullName: 'Quản trị hệ thống', role: Role.ADMIN, passwordHash: await hashPassword(DEMO_PASSWORD), mustChangePassword: false },
    ]);
    admin = created.toObject();
  }
  const adminUser: AuthUser = { id: admin!._id as Types.ObjectId, role: Role.ADMIN };
  const staffAccount = async (email: string, fullName: string, role: Role, teacherProfile?: { languages: string[]; levels: string[] }): Promise<AuthUser> => {
    const { user } = await svc.users.createStaff({ email, fullName, role, ...(teacherProfile ? { teacherProfile } : {}) }, adminUser);
    demoUserIds.push(user._id);
    return { id: user._id, role };
  };
  await staffAccount('manager@center.local', 'Trần Thu Hà', Role.MANAGER);
  const staff1 = await staffAccount('staff1@center.local', 'Lê Minh Anh', Role.ACADEMIC_STAFF);
  const staff2 = await staffAccount('staff2@center.local', 'Phạm Quang Huy', Role.ACADEMIC_STAFF);
  const teacherSpecs: [string, string[], string[]][] = [
    ['Nguyễn Thị Lan', ['Tiếng Anh'], ['A1', 'A2', 'B1', 'B2']],
    ['David Miller', ['Tiếng Anh'], ['4.0', '5.0', '6.0', '7.0']],
    ['Đỗ Hải Yến', ['Tiếng Anh'], ['A1', 'A2', 'B1']],
    ['Tanaka Yuki', ['Tiếng Nhật'], ['N5', 'N4', 'N3']],
    ['Vũ Đức Sơn', ['Tiếng Anh'], ['5.0', '6.0', '7.0']],
  ];
  const teachers: AuthUser[] = [];
  for (const [i, [name, languages, levels]] of teacherSpecs.entries()) {
    teachers.push(await staffAccount(`teacher${i + 1}@center.local`, name, Role.TEACHER, { languages, levels }));
  }

  const courseSpecs = [
    { code: 'ENG-GT', name: 'Tiếng Anh giao tiếp', language: 'Tiếng Anh', levels: ['A1', 'A2', 'B1', 'B2'], totalSessions: 24, baseFee: 3_600_000 },
    { code: 'ENG-IELTS', name: 'Luyện thi IELTS', language: 'Tiếng Anh', levels: ['4.0', '5.0', '6.0', '7.0'], totalSessions: 30, baseFee: 6_500_000 },
    { code: 'JPN', name: 'Tiếng Nhật', language: 'Tiếng Nhật', levels: ['N5', 'N4', 'N3'], totalSessions: 24, baseFee: 4_200_000 },
  ];
  const courses: CourseDto[] = [];
  for (const c of courseSpecs) courses.push(await svc.courses.create(c));
  const [GT, IELTS, JPN] = courses;
  const rooms: RoomDto[] = [];
  for (const n of [1, 2, 3, 4, 5, 6]) rooms.push(await svc.rooms.create({ code: `P10${n}`, name: `Phòng 10${n}`, capacity: n <= 4 ? 20 : 30 }));

  type ClassSpec = { code: string; course: typeof GT; level: string; teacher: number; room: number; start: string; end: string; weekdays: number[]; time: [string, string]; sessionsTo?: string };
  const ONGOING_FROM = '2026-10-05';
  const ONGOING_TO = '2026-11-29'; // eight teaching weeks
  const classSpecs: ClassSpec[] = [
    { code: 'GT-A1-01', course: GT, level: 'A1', teacher: 0, room: 0, start: ONGOING_FROM, end: '2026-12-20', weekdays: [1, 3], time: ['18:00', '19:30'], sessionsTo: ONGOING_TO },
    { code: 'IELTS-5.0-01', course: IELTS, level: '5.0', teacher: 1, room: 1, start: ONGOING_FROM, end: '2026-12-20', weekdays: [2, 4], time: ['18:00', '19:30'], sessionsTo: ONGOING_TO },
    { code: 'GT-A2-01', course: GT, level: 'A2', teacher: 2, room: 2, start: ONGOING_FROM, end: '2026-12-20', weekdays: [1, 3], time: ['18:00', '19:30'], sessionsTo: ONGOING_TO },
    { code: 'JPN-N5-01', course: JPN, level: 'N5', teacher: 3, room: 3, start: ONGOING_FROM, end: '2026-12-20', weekdays: [2, 4], time: ['18:00', '19:30'], sessionsTo: ONGOING_TO },
    { code: 'IELTS-6.0-01', course: IELTS, level: '6.0', teacher: 4, room: 4, start: ONGOING_FROM, end: '2026-12-20', weekdays: [1, 3], time: ['19:45', '21:15'], sessionsTo: ONGOING_TO },
    { code: 'GT-B1-01', course: GT, level: 'B1', teacher: 0, room: 5, start: '2026-11-16', end: '2027-02-10', weekdays: [1, 3], time: ['19:45', '21:15'], sessionsTo: '2026-12-13' },
    { code: 'JPN-N4-01', course: JPN, level: 'N4', teacher: 3, room: 5, start: '2026-11-17', end: '2027-02-11', weekdays: [2, 4], time: ['19:45', '21:15'] },
    { code: 'GT-A1-00', course: GT, level: 'A1', teacher: 0, room: 0, start: '2026-07-06', end: '2026-09-23', weekdays: [1, 3], time: ['18:00', '19:30'], sessionsTo: '2026-09-23' },
  ];
  const classes: ClassDto[] = [];
  for (const c of classSpecs) {
    classes.push(
      await svc.classes.create(
        { code: c.code, name: `${c.course.name} ${c.level} — lớp ${c.code.slice(-2)}`, courseId: c.course.id, level: c.level, teacherId: str(teachers[c.teacher].id), defaultRoomId: rooms[c.room].id, maxCapacity: 20, startDate: c.start, endDate: c.end },
        staff1,
      ),
    );
  }
  const [, , , , , planned, inactive, finished] = classes;
  const ongoing = classes.slice(0, 5);
  const specOf = (classId: string) => classSpecs[classes.findIndex((c) => c.id === classId)];
  await svc.classes.deactivate(inactive.id, staff1);

  // --- Students: lead -> convert (60) ------------------------------------------------------
  type Plan = { n: number; course: typeof GT; target?: ClassDto; level?: string; createdOn: string };
  const plans: Plan[] = [];
  for (let n = 1; n <= 60; n++) {
    if (n <= 8) plans.push({ n, course: GT, target: finished, level: 'A1', createdOn: '2026-06-15' });
    else if (n <= 48) {
      const cls = ongoing[(n - 9) % 5];
      plans.push({ n, course: courses.find((c) => c.id === cls.courseId)!, target: cls, level: cls.level, createdOn: '2026-09-14' });
    } else if (n <= 52) plans.push({ n, course: GT, target: planned, level: 'B1', createdOn: '2026-09-14' });
    else if (n <= 56) plans.push({ n, course: n % 2 ? GT : IELTS, level: n % 2 ? 'B1' : '6.0', createdOn: '2026-10-12' });
    else plans.push({ n, course: GT, createdOn: addVnDays('2026-10-26', n - 57) });
  }
  const enrollmentOf = new Map<number, string>();
  const accountOf = new Map<number, AuthUser>();
  const newLead = (i: number) => {
    const gender = rand() < 0.5 ? Gender.MALE : Gender.FEMALE;
    const middle = gender === Gender.MALE ? pick(MIDDLE.filter((x) => x !== 'Thị')) : pick(MIDDLE.filter((x) => x !== 'Văn'));
    return {
      fullName: `${pick(LAST)} ${middle} ${pick(FIRST)}`,
      dob: `${2000 + Math.floor(rand() * 12)}-${pad(1 + Math.floor(rand() * 12), 2)}-${pad(1 + Math.floor(rand() * 28), 2)}`,
      gender,
      address: pick(ADDRESSES),
      i,
    };
  };
  for (const p of plans) {
    const person = newLead(p.n);
    tl.add(at(p.createdOn, '10:00'), async () => {
      const lead = await svc.leads.create(
        staff1,
        { fullName: person.fullName, dob: person.dob, gender: person.gender, phone: `09${pad(10_000_000 + p.n * 7919, 8).slice(-8)}`, email: `hocvien${p.n}@example.com`, address: person.address, interestedCourseId: p.course.id, note: 'Đăng ký qua tư vấn trực tiếp' },
        false,
      );
      const res = await svc.convert.convert(staff1, lead.id, false);
      enrollmentOf.set(p.n, res.enrollmentId!);
      const student = await conn.models[Models.Student].findById(res.student.id, { userId: 1 }).lean<{ userId: Types.ObjectId }>();
      demoUserIds.push(student!.userId);
      accountOf.set(p.n, { id: student!.userId, role: Role.STUDENT, studentId: new Types.ObjectId(res.student.id) });
    });
  }
  // Leads still in the funnel: 12 NEW, 3 cancelled.
  for (let i = 0; i < 15; i++) {
    const person = newLead(100 + i);
    tl.add(at(addVnDays('2026-10-15', i), '14:00'), async () => {
      const lead = await svc.leads.create(
        i % 2 ? staff2 : staff1,
        { fullName: person.fullName, dob: person.dob, gender: person.gender, phone: `08${pad(20_000_000 + i * 104_729, 8).slice(-8)}`, interestedCourseId: courses[i % 3].id, note: i < 12 ? 'Quan tâm lớp buổi tối' : 'Không liên lạc được' },
        false,
      );
      if (i >= 12) await svc.leads.cancel(staff1, lead.id, { reason: 'Không liên lạc được sau 3 lần gọi' });
    });
  }

  // --- Placement tests (completed) and skip-placement -------------------------------------
  const placementRound = (day: string, groups: { course: typeof GT; room: number; teacher: number; members: Plan[] }[]) => {
    tl.add(at(addVnDays(day, -3), '09:00'), async () => {
      for (const g of groups) {
        const test = await svc.placement.create(staff1, { courseId: g.course.id, startAt: at(day, '09:00').toISOString(), endAt: at(day, '10:30').toISOString(), roomId: rooms[g.room].id, teacherId: str(teachers[g.teacher].id) });
        await svc.placement.addCandidates(staff1, test.id, { enrollmentIds: g.members.map((m) => enrollmentOf.get(m.n)!) });
        tl.add(at(day, '11:00'), async () => {
          await svc.placement.putResults(
            teachers[g.teacher],
            test.id,
            g.members.map((m) => ({ enrollmentId: enrollmentOf.get(m.n)!, score: Math.round((5 + rand() * 5) * 4) / 4, level: m.level!, comment: 'Phù hợp trình độ' })),
          );
        });
      }
    });
  };
  const seated = plans.filter((p) => p.target);
  placementRound('2026-06-20', [{ course: GT, room: 5, teacher: 2, members: seated.filter((p) => p.target === finished) }]);
  placementRound('2026-09-19', [
    { course: GT, room: 0, teacher: 2, members: seated.filter((p) => p.n > 8 && p.course === GT) },
    { course: IELTS, room: 1, teacher: 1, members: seated.filter((p) => p.n > 8 && p.course === IELTS) },
    { course: JPN, room: 2, teacher: 3, members: seated.filter((p) => p.course === JPN) },
  ]);
  for (const p of plans.filter((x) => !x.target && x.level)) {
    tl.add(at('2026-10-19', '15:00'), async () => {
      await svc.enrollments.skipPlacement(enrollmentOf.get(p.n)!, { level: p.level!, reason: 'Đã có chứng chỉ quốc tế còn hạn' }, staff1);
    });
  }
  // The upcoming placement test for the PENDING_PLACEMENT candidates.
  tl.add(at('2026-10-30', '10:00'), async () => {
    const test = await svc.placement.create(staff1, { courseId: GT.id, startAt: at('2026-11-07', '09:00').toISOString(), endAt: at('2026-11-07', '10:30').toISOString(), roomId: rooms[5].id, teacherId: str(teachers[2].id) });
    await svc.placement.addCandidates(staff1, test.id, { enrollmentIds: plans.filter((p) => !p.level).map((p) => enrollmentOf.get(p.n)!) });
  });

  // --- Class lifecycle: assign, schedule, start, attend, grade, pay, finish -------------------
  const todayStart = startOfVnDay(DEMO_TODAY);
  const takeAttendance = (sessionId: Types.ObjectId, endAt: Date) => {
    tl.add(new Date(endAt.getTime() + 5 * 60_000), async () => {
      const session = await Session.findById(sessionId).lean();
      if (!session || session.status !== SessionStatus.SCHEDULED) return;
      const roster = await svc.attendance.roster(session);
      const records = roster.map((e) => {
        const r = rand();
        const status = r < 0.82 ? AttendanceStatus.PRESENT : r < 0.9 ? AttendanceStatus.LATE : r < 0.95 ? AttendanceStatus.EXCUSED : AttendanceStatus.UNEXCUSED;
        return { studentId: str(e.studentId), status, ...(status === AttendanceStatus.EXCUSED ? { note: 'Có xin phép' } : {}) };
      });
      await svc.attendance.take(str(session._id), { records }, { id: session.teacherId, role: Role.TEACHER });
    });
  };
  const assessment = (cls: ClassDto, name: string, type: AssessmentType, weight: number, heldOn: string, confirm: boolean, createOn = addVnDays(heldOn, -3)) => {
    const teacher = teachers[specOf(cls.id).teacher];
    tl.add(at(createOn, '08:00'), async () => {
      const a = await svc.grades.create(cls.id, { name, type, weight, heldOn }, teacher);
      if (!confirm) return;
      tl.add(at(addVnDays(heldOn, 1), '10:00'), async () => {
        const roster = await Enrollment.find({ classId: new Types.ObjectId(cls.id), status: EnrollmentStatus.ENROLLED }).sort({ _id: 1 }).lean();
        const grades = roster.map((e) => ({ studentId: str(e.studentId), score: Math.round((5 + rand() * 5) * 4) / 4, ...(rand() < 0.3 ? { comment: 'Cần luyện thêm kỹ năng nghe' } : {}) }));
        await svc.grades.upsertGrades(a.id, { grades, confirm: true }, teacher);
      });
    });
  };
  const lifecycle = (cls: ClassDto, o: { assignOn: string; scheduleOn: string; paidOn: string; payPlan: (k: number) => 'PAID' | 'PARTIAL' | 'UNPAID'; start: boolean }) => {
    const spec = specOf(cls.id);
    const members = seated.filter((p) => p.target === cls);
    tl.add(at(o.assignOn, '09:00'), async () => {
      for (const [k, p] of members.entries()) {
        const e = await svc.assignment.assign(enrollmentOf.get(p.n)!, { classId: cls.id }, staff1);
        if (k % 4 !== 3) tl.add(at(addVnDays(o.assignOn, 1), '20:00'), async () => void (await svc.enrollments.confirm(accountOf.get(p.n)!, e.id)));
        const plan = o.payPlan(k);
        if (plan === 'UNPAID') continue;
        tl.add(at(addVnDays(o.paidOn, k % 6), '10:00'), async () => {
          const fresh = await Enrollment.findById(e.id).lean();
          const invoice = await conn.models[Models.Invoice].findById(fresh!.invoiceId).lean<{ _id: Types.ObjectId; finalAmount: number }>();
          const fee = invoice!.finalAmount;
          await svc.payments.record(str(invoice!._id), { amount: plan === 'PAID' ? fee : Math.round(fee / 2), method: [PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER, PaymentMethod.CARD][k % 3] }, staff1);
        });
      }
    });
    tl.add(at(o.scheduleOn, '09:00'), async () => {
      const res = await svc.schedule.createBulk(
        { classId: cls.id, roomId: rooms[spec.room].id, teacherId: str(teachers[spec.teacher].id), weekdays: spec.weekdays, startTime: spec.time[0], endTime: spec.time[1], fromDate: spec.start, toDate: spec.sessionsTo! },
        staff1,
      );
      for (const s of res.sessions) {
        const endAt = new Date(s.endAt);
        if (new Date(s.startAt) < todayStart) takeAttendance(new Types.ObjectId(s.id), endAt);
      }
    });
    if (o.start) tl.add(at(spec.start, '07:00'), async () => void (await svc.classes.update(cls.id, { status: ClassStatus.ONGOING }, staff1)));
  };

  // Finished summer class: everyone paid, three confirmed assessments, finished on 2026-09-24.
  lifecycle(finished, { assignOn: '2026-06-29', scheduleOn: '2026-06-30', paidOn: '2026-07-01', payPlan: () => 'PAID', start: true });
  assessment(finished, 'Kiểm tra 15 phút', AssessmentType.QUIZ, 20, '2026-07-27', true);
  assessment(finished, 'Giữa kỳ', AssessmentType.MIDTERM, 30, '2026-08-17', true);
  assessment(finished, 'Cuối kỳ', AssessmentType.FINAL, 50, '2026-09-21', true);
  tl.add(at('2026-09-24', '10:00'), async () => void (await svc.classes.update(finished.id, { status: ClassStatus.FINISHED }, staff1)));

  // Ongoing classes: PAID / PAID / PAID / PARTIAL / UNPAID (overdue: due 2026-10-12).
  const ongoingPlan = (k: number) => (['PAID', 'PAID', 'PAID', 'PARTIAL', 'UNPAID'] as const)[k % 5];
  for (const cls of ongoing) {
    lifecycle(cls, { assignOn: '2026-09-28', scheduleOn: '2026-09-29', paidOn: '2026-10-01', payPlan: ongoingPlan, start: true });
    assessment(cls, 'Kiểm tra 15 phút', AssessmentType.QUIZ, 20, '2026-10-14', true);
    assessment(cls, 'Kỹ năng nói', AssessmentType.SKILL, 20, '2026-10-28', true);
    assessment(cls, 'Giữa kỳ', AssessmentType.MIDTERM, 30, '2026-11-11', false, '2026-10-30');
  }
  // Past-due, not yet confirmed: teacher1 sees it under "Bài cần nhập điểm" on demo today.
  assessment(ongoing[0], 'Kiểm tra nhanh', AssessmentType.QUIZ, 10, '2026-10-31', false);
  // Planned class: seated, invoices not yet due and unpaid; sessions already scheduled.
  lifecycle(planned, { assignOn: '2026-10-20', scheduleOn: '2026-10-21', paidOn: '2026-10-22', payPlan: () => 'UNPAID', start: false });

  // A cancelled session (teacher ill) cancelled the day before.
  tl.add(at('2026-10-13', '12:00'), async () => {
    const s = await Session.findOne({ classId: new Types.ObjectId(ongoing[0].id), startAt: at('2026-10-14', '18:00') }).lean();
    await svc.schedule.cancel(str(s!._id), 'Giáo viên ốm, học bù sau', staff1);
  });

  await tl.drain();

  // --- Demo credentials ------------------------------------------------------------------------
  await User.updateMany({ _id: { $in: demoUserIds } }, { $set: { passwordHash: await hashPassword(DEMO_PASSWORD), mustChangePassword: false } });
  setNow(today);
  return { status: 'created' };
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const { status } = await runSeedDemo(app, { reset: process.argv.includes('--reset') });
    console.log(
      status === 'created'
        ? `Demo data created (demo today ${DEMO_TODAY}). All demo accounts use password: ${DEMO_PASSWORD}`
        : 'Demo data already present (manager@center.local exists). Use --reset to recreate.',
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
