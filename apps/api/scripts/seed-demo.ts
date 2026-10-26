import '../src/config/load-dotenv';
import 'reflect-metadata';
import { connect, Connection, connection, disconnect, Model, Types } from 'mongoose';
import {
  AssessmentType,
  AttendanceStatus,
  ClassStatus,
  EnrollmentStatus,
  InvoiceKind,
  InvoiceStatus,
  LeadStatus,
  NotificationRefType,
  NotificationType,
  PaymentMethod,
  Role,
  addVnDays,
  fromDateOnly,
  toDateOnly,
  vnDateTime,
} from '@lc/shared';
import { loadEnv } from '../src/config/env';
import { Models } from '../src/database/models';
import { AssessmentSchema } from '../src/database/schemas/assessment.schema';
import { AttendanceSchema } from '../src/database/schemas/attendance.schema';
import { ClassSchema } from '../src/database/schemas/class.schema';
import { CounterSchema } from '../src/database/schemas/counter.schema';
import { CourseSchema } from '../src/database/schemas/course.schema';
import { EnrollmentSchema } from '../src/database/schemas/enrollment.schema';
import { GradeSchema } from '../src/database/schemas/grade.schema';
import { InvoiceSchema } from '../src/database/schemas/invoice.schema';
import { LeadSchema } from '../src/database/schemas/lead.schema';
import { NotificationSchema } from '../src/database/schemas/notification.schema';
import { PaymentSchema } from '../src/database/schemas/payment.schema';
import { PlacementTestSchema } from '../src/database/schemas/placement-test.schema';
import { RoomSchema } from '../src/database/schemas/room.schema';
import { SessionSchema } from '../src/database/schemas/session.schema';
import { StudentSchema } from '../src/database/schemas/student.schema';
import { UserSchema } from '../src/database/schemas/user.schema';
import { hashPassword } from '../src/modules/auth/password';

/**
 * Dev-only demo data (BACKEND_SCHEMA §4). Inserts documents directly, so it does not
 * exercise business services — Wave 3 (W3-L3) replaces it with a service-driven seed.
 * Usage: pnpm --filter api seed:demo [--reset]
 */
export const DEMO_PASSWORD = 'Password1';
const TODAY = '2026-10-27';

const SCHEMAS = {
  User: UserSchema,
  Course: CourseSchema,
  Room: RoomSchema,
  Lead: LeadSchema,
  Student: StudentSchema,
  Counter: CounterSchema,
  Enrollment: EnrollmentSchema,
  PlacementTest: PlacementTestSchema,
  Class: ClassSchema,
  Session: SessionSchema,
  Attendance: AttendanceSchema,
  Assessment: AssessmentSchema,
  Grade: GradeSchema,
  Invoice: InvoiceSchema,
  Payment: PaymentSchema,
  Notification: NotificationSchema,
} as const;

type ModelMap = { -readonly [K in keyof typeof SCHEMAS]: Model<Record<string, unknown>> };

function modelsFor(conn: Connection): ModelMap {
  const out = {} as ModelMap;
  for (const [key, schema] of Object.entries(SCHEMAS)) {
    const name = Models[key as keyof typeof Models];
    out[key as keyof ModelMap] = conn.models[name] ?? conn.model(name, schema);
  }
  return out;
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

const id = () => new Types.ObjectId();
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const day = (d: string) => fromDateOnly(d);

async function reset(m: ModelMap): Promise<void> {
  for (const [key, model] of Object.entries(m)) {
    if (key === 'User') await model.deleteMany({ role: { $ne: Role.ADMIN } });
    else await model.deleteMany({});
  }
}

export async function seedDemo(conn: Connection, opts: { reset?: boolean } = {}): Promise<'created' | 'exists'> {
  const m = modelsFor(conn);
  if (opts.reset) await reset(m);
  if (await m.User.exists({ username: 'manager@center.local' })) return 'exists';

  const rand = rng(2026);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const hash = await hashPassword(DEMO_PASSWORD);

  // --- Staff accounts -------------------------------------------------------
  const staff = (email: string, fullName: string, role: Role, extra: Record<string, unknown> = {}) => ({
    _id: id(), username: email, email, fullName, role, passwordHash: hash, mustChangePassword: false, ...extra,
  });
  const manager = staff('manager@center.local', 'Trần Thu Hà', Role.MANAGER);
  const staffs = [
    staff('staff1@center.local', 'Lê Minh Anh', Role.ACADEMIC_STAFF),
    staff('staff2@center.local', 'Phạm Quang Huy', Role.ACADEMIC_STAFF),
  ];
  const teacherSpecs: [string, string[], string[]][] = [
    ['Nguyễn Thị Lan', ['Tiếng Anh'], ['A1', 'A2', 'B1', 'B2']],
    ['David Miller', ['Tiếng Anh'], ['4.0', '5.0', '6.0', '7.0']],
    ['Đỗ Hải Yến', ['Tiếng Anh'], ['A1', 'A2', 'B1']],
    ['Tanaka Yuki', ['Tiếng Nhật'], ['N5', 'N4', 'N3']],
    ['Vũ Đức Sơn', ['Tiếng Anh'], ['5.0', '6.0', '7.0']],
  ];
  const teachers = teacherSpecs.map(([name, languages, levels], i) =>
    staff(`teacher${i + 1}@center.local`, name, Role.TEACHER, { teacherProfile: { languages, levels } }),
  );
  await m.User.insertMany([manager, ...staffs, ...teachers]);

  // --- Catalog ---------------------------------------------------------------
  const courses = [
    { _id: id(), code: 'ENG-GT', name: 'Tiếng Anh giao tiếp', language: 'Tiếng Anh', levels: ['A1', 'A2', 'B1', 'B2'], totalSessions: 24, baseFee: 3_600_000 },
    { _id: id(), code: 'ENG-IELTS', name: 'Luyện thi IELTS', language: 'Tiếng Anh', levels: ['4.0', '5.0', '6.0', '7.0'], totalSessions: 30, baseFee: 6_500_000 },
    { _id: id(), code: 'JPN', name: 'Tiếng Nhật', language: 'Tiếng Nhật', levels: ['N5', 'N4', 'N3'], totalSessions: 24, baseFee: 4_200_000 },
  ];
  await m.Course.insertMany(courses);
  const rooms = [1, 2, 3, 4, 5, 6].map((n) => ({
    _id: id(), code: `P10${n}`, name: `Phòng 10${n}`, capacity: n <= 4 ? 20 : 30,
  }));
  await m.Room.insertMany(rooms);

  // --- Students (with STUDENT accounts) --------------------------------------
  const students = Array.from({ length: 60 }, (_, i) => {
    const n = i + 1;
    const gender = rand() < 0.5 ? 'MALE' : 'FEMALE';
    const middle = gender === 'MALE' ? pick(MIDDLE.filter((x) => x !== 'Thị')) : pick(MIDDLE.filter((x) => x !== 'Văn'));
    return {
      _id: id(),
      userId: id(),
      code: `HV2026${pad(n, 5)}`,
      fullName: `${pick(LAST)} ${middle} ${pick(FIRST)}`,
      dob: day(`${2000 + Math.floor(rand() * 12)}-${pad(1 + Math.floor(rand() * 12), 2)}-${pad(1 + Math.floor(rand() * 28), 2)}`),
      gender,
      phone: `09${pad(10_000_000 + n * 7919, 8).slice(-8)}`,
      email: `hocvien${n}@example.com`,
      address: pick(['Cầu Giấy, Hà Nội', 'Đống Đa, Hà Nội', 'Thanh Xuân, Hà Nội', 'Hai Bà Trưng, Hà Nội', 'Hoàng Mai, Hà Nội']),
      createdBy: staffs[0]._id,
    };
  });
  await m.Student.create(students); // create(), not insertMany: runs fullNameSearch hooks
  await m.User.insertMany(
    students.map((s) => ({
      _id: s.userId, username: s.code, fullName: s.fullName, role: Role.STUDENT, studentId: s._id,
      passwordHash: hash, mustChangePassword: false,
    })),
  );

  // --- Leads -------------------------------------------------------------------
  await m.Lead.create(
    Array.from({ length: 15 }, (_, i) => ({
      fullName: `${pick(LAST)} ${pick(MIDDLE)} ${pick(FIRST)}`,
      dob: day(`200${i % 10}-05-1${i % 9}`),
      gender: i % 2 ? 'MALE' : 'FEMALE',
      phone: `08${pad(20_000_000 + i * 104_729, 8).slice(-8)}`,
      interestedCourseId: courses[i % 3]._id,
      status: i < 12 ? LeadStatus.NEW : LeadStatus.CANCELLED,
      note: i < 12 ? 'Quan tâm lớp buổi tối' : 'Không liên lạc được',
      createdBy: staffs[i % 2]._id,
    })),
  );

  // --- Classes (no room/teacher overlaps: see slot table) -----------------------
  const classSpecs = [
    // code, course, level, status, start, end
    ['GT-A1-01', 0, 'A1', ClassStatus.ONGOING, '2026-10-05', '2026-12-30'],
    ['IELTS-5.0-01', 1, '5.0', ClassStatus.ONGOING, '2026-10-06', '2026-12-31'],
    ['GT-A2-01', 0, 'A2', ClassStatus.ONGOING, '2026-10-05', '2026-12-30'],
    ['JPN-N5-01', 2, 'N5', ClassStatus.ONGOING, '2026-10-06', '2026-12-31'],
    ['IELTS-6.0-01', 1, '6.0', ClassStatus.ONGOING, '2026-10-05', '2026-12-30'],
    ['GT-B1-01', 0, 'B1', ClassStatus.PLANNED, '2026-11-17', '2027-02-11'],
    ['JPN-N4-01', 2, 'N4', ClassStatus.PLANNED, '2026-11-16', '2027-02-10'],
    ['GT-A1-00', 0, 'A1', ClassStatus.FINISHED, '2026-07-07', '2026-09-24'],
  ] as const;
  const classes = classSpecs.map(([code, ci, level, status, start, end], i) => ({
    _id: id(),
    code,
    name: `${courses[ci].name} ${level} — lớp ${code.slice(-2)}`,
    courseId: courses[ci]._id,
    level,
    teacherId: teachers[i % 5]._id,
    defaultRoomId: rooms[i % 6]._id,
    maxCapacity: 20,
    currentSize: 0,
    startDate: day(start),
    endDate: day(end),
    status,
    // slot: Mon/Wed (1,3) for even i, Tue/Thu (2,4) for odd i; 18:00 for i<4, 19:45 otherwise
    weekdays: i % 2 === 0 ? [1, 3] : [2, 4],
    time: i < 4 ? ['18:00', '19:30'] : ['19:45', '21:15'],
  }));

  // --- Enrollments ---------------------------------------------------------------
  const enrollments: Record<string, unknown>[] = [];
  const roster = new Map<string, typeof students>();
  const enrollIn = [0, 1, 2, 3, 4, 7]; // classes that get students
  students.slice(0, 48).forEach((s, i) => {
    const cls = classes[enrollIn[i % enrollIn.length]];
    const finished = cls.status === ClassStatus.FINISHED;
    const status = finished ? EnrollmentStatus.COMPLETED : EnrollmentStatus.ENROLLED;
    const enrolledAt = addDaysDate(cls.startDate, -3);
    enrollments.push({
      _id: id(), studentId: s._id, courseId: cls.courseId, classId: cls._id, status,
      placementLevel: cls.level, waitingSince: addDaysDate(cls.startDate, -10), enrolledAt,
      confirmedAt: i % 4 === 0 ? null : enrolledAt,
      history: [
        { from: null, to: EnrollmentStatus.PENDING_PLACEMENT, at: addDaysDate(cls.startDate, -14), by: staffs[0]._id },
        { from: EnrollmentStatus.PENDING_PLACEMENT, to: EnrollmentStatus.WAITING_CLASS, at: addDaysDate(cls.startDate, -10), by: teachers[0]._id },
        { from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED, at: enrolledAt, by: staffs[0]._id },
        ...(finished ? [{ from: EnrollmentStatus.ENROLLED, to: EnrollmentStatus.COMPLETED, at: cls.endDate, by: staffs[0]._id }] : []),
      ],
    });
    if (!finished) cls.currentSize += 1;
    roster.set(String(cls._id), [...(roster.get(String(cls._id)) ?? []), s]);
  });
  const waiting = students.slice(48, 54).map((s, i) => ({
    _id: id(), studentId: s._id, courseId: courses[i % 2]._id, status: EnrollmentStatus.WAITING_CLASS,
    placementLevel: i % 2 ? '6.0' : 'B1', waitingSince: day(addVnDays(TODAY, -(3 + i * 4))),
    history: [{ from: null, to: EnrollmentStatus.PENDING_PLACEMENT, at: day(addVnDays(TODAY, -(10 + i * 4))), by: staffs[1]._id }],
  }));
  const pending = students.slice(54, 60).map((s, i) => ({
    _id: id(), studentId: s._id, courseId: courses[i % 3]._id, status: EnrollmentStatus.PENDING_PLACEMENT,
    history: [{ from: null, to: EnrollmentStatus.PENDING_PLACEMENT, at: day(addVnDays(TODAY, -i)), by: staffs[1]._id }],
  }));
  await m.Enrollment.insertMany([...enrollments, ...waiting, ...pending]);
  // weekdays/time are seed-only slot hints; strict schema drops unknown fields.
  await m.Class.insertMany(classes);

  // --- Placement test for the pending candidates ------------------------------------
  await m.PlacementTest.create({
    courseId: courses[0]._id, roomId: rooms[5]._id, teacherId: teachers[2]._id,
    startAt: vnDateTime('2026-10-31', '09:00'), endAt: vnDateTime('2026-10-31', '10:30'),
    candidates: pending.map((e) => ({ enrollmentId: e._id, studentId: e.studentId })),
  });

  // --- Sessions + attendance --------------------------------------------------------
  const sessions: Record<string, unknown>[] = [];
  const attendances: Record<string, unknown>[] = [];
  for (const cls of classes) {
    const start = isoDay(cls.startDate);
    const end = isoDay(cls.endDate);
    for (let d = start; d <= end; d = addVnDays(d, 1)) {
      const wd = isoWeekday(d);
      if (!cls.weekdays.includes(wd)) continue;
      const startAt = vnDateTime(d, cls.time[0]);
      const endAt = vnDateTime(d, cls.time[1]);
      const past = d < TODAY;
      const cancelled = cls.code === 'GT-A1-01' && d === '2026-10-14';
      const session = {
        _id: id(), classId: cls._id, roomId: cls.defaultRoomId, teacherId: cls.teacherId, startAt, endAt,
        status: cancelled ? 'CANCELLED' : 'SCHEDULED',
        cancelReason: cancelled ? 'Giáo viên ốm, học bù sau' : null,
        attendanceTakenAt: past && !cancelled && cls.status !== ClassStatus.PLANNED ? endAt : null,
        createdBy: staffs[0]._id,
      };
      sessions.push(session);
      if (!session.attendanceTakenAt) continue;
      for (const s of roster.get(String(cls._id)) ?? []) {
        const r = rand();
        const status = r < 0.82 ? AttendanceStatus.PRESENT : r < 0.9 ? AttendanceStatus.LATE : r < 0.95 ? AttendanceStatus.EXCUSED : AttendanceStatus.UNEXCUSED;
        const enrollment = enrollments.find((e) => e.studentId === s._id && e.classId === cls._id);
        attendances.push({
          sessionId: session._id, classId: cls._id, studentId: s._id, enrollmentId: enrollment?._id,
          status, recordedBy: cls.teacherId,
        });
      }
    }
  }
  await m.Session.insertMany(sessions);
  await m.Attendance.insertMany(attendances);

  // --- Assessments + grades -----------------------------------------------------------
  const assessments: Record<string, unknown>[] = [];
  const grades: Record<string, unknown>[] = [];
  const score = () => Math.round((5 + rand() * 5) * 4) / 4; // 5.00–10.00, step 0.25
  for (const cls of classes) {
    if (cls.status === ClassStatus.PLANNED) continue;
    const finished = cls.status === ClassStatus.FINISHED;
    const plan: [string, AssessmentType, number, string, boolean][] = finished
      ? [
          ['Kiểm tra 15 phút', AssessmentType.QUIZ, 20, '2026-07-28', true],
          ['Giữa kỳ', AssessmentType.MIDTERM, 30, '2026-08-18', true],
          ['Cuối kỳ', AssessmentType.FINAL, 50, '2026-09-22', true],
        ]
      : [
          ['Kiểm tra 15 phút', AssessmentType.QUIZ, 20, '2026-10-19', true],
          ['Giữa kỳ', AssessmentType.MIDTERM, 30, '2026-11-09', false],
        ];
    for (const [name, type, weight, heldOn, graded] of plan) {
      const a = { _id: id(), classId: cls._id, name, type, weight, heldOn: day(heldOn), confirmedAt: graded ? day(addVnDays(heldOn, 2)) : null, createdBy: cls.teacherId };
      assessments.push(a);
      if (!graded) continue;
      for (const s of roster.get(String(cls._id)) ?? []) {
        const enrollment = enrollments.find((e) => e.studentId === s._id && e.classId === cls._id);
        grades.push({ assessmentId: a._id, classId: cls._id, studentId: s._id, enrollmentId: enrollment?._id, score: score(), comment: rand() < 0.3 ? 'Cần luyện thêm kỹ năng nghe' : '', isDraft: false });
      }
    }
  }
  await m.Assessment.insertMany(assessments);
  await m.Grade.insertMany(grades);

  // --- Invoices + payments (UNPAID / PARTIAL / PAID, some overdue) ----------------------
  const invoices: Record<string, unknown>[] = [];
  const payments: Record<string, unknown>[] = [];
  let invSeq = 0;
  let paySeq = 0;
  for (const e of enrollments) {
    const cls = classes.find((c) => c._id === e.classId)!;
    const course = courses.find((c) => c._id === e.courseId)!;
    const dueDay = addVnDays(isoDay(cls.startDate), 7);
    const period = dueDay.slice(0, 7).replace('-', '');
    const r = rand();
    const paid = cls.status === ClassStatus.FINISHED || r < 0.55 ? course.baseFee : r < 0.8 ? Math.round(course.baseFee / 2) : 0;
    const invoice = {
      _id: id(), code: `HD${period}${pad(++invSeq, 4)}`, kind: InvoiceKind.TUITION,
      studentId: e.studentId, enrollmentId: e._id, courseId: course._id, classId: cls._id,
      amountDue: course.baseFee, finalAmount: course.baseFee, amountPaid: paid, balance: course.baseFee - paid,
      dueDate: day(dueDay),
      status: paid === course.baseFee ? InvoiceStatus.PAID : paid > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.UNPAID,
    };
    invoices.push(invoice);
    e.invoiceId = invoice._id;
    if (paid > 0) {
      payments.push({
        code: `PT${period}${pad(++paySeq, 4)}`, invoiceId: invoice._id, studentId: e.studentId, amount: paid,
        method: pick([PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER, PaymentMethod.CARD]),
        paidAt: vnDateTime(addVnDays(dueDay, -Math.floor(rand() * 6)), '10:00'), recordedBy: staffs[0]._id,
      });
    }
  }
  await m.Invoice.insertMany(invoices);
  await m.Payment.insertMany(payments);
  for (const e of enrollments) await m.Enrollment.updateOne({ _id: e._id }, { invoiceId: e.invoiceId });

  // --- Counters so services continue after the demo codes ---------------------------------
  const counterMax: Record<string, number> = { 'student:2026': 60 };
  for (const inv of invoices) counterMax[`invoice:${String(inv.code).slice(2, 8)}`] = Math.max(counterMax[`invoice:${String(inv.code).slice(2, 8)}`] ?? 0, Number(String(inv.code).slice(8)));
  for (const p of payments) counterMax[`payment:${String(p.code).slice(2, 8)}`] = Math.max(counterMax[`payment:${String(p.code).slice(2, 8)}`] ?? 0, Number(String(p.code).slice(8)));
  for (const [key, seq] of Object.entries(counterMax)) {
    await m.Counter.updateOne({ _id: key }, { $max: { seq } }, { upsert: true });
  }

  // --- Notifications ------------------------------------------------------------------------
  const firstStudentUser = students[0].userId;
  const firstClass = classes[0];
  await m.Notification.insertMany([
    { userId: firstStudentUser, type: NotificationType.CLASS_ASSIGNED, title: 'Bạn đã được xếp lớp', body: `Bạn được xếp vào lớp ${firstClass.code}. Hãy xác nhận lớp học.`, refType: NotificationRefType.CLASS, refId: firstClass._id },
    { userId: firstStudentUser, type: NotificationType.SESSION_CANCELLED, title: 'Buổi học bị hủy', body: 'Buổi học ngày 14/10 của lớp GT-A1-01 bị hủy: Giáo viên ốm, học bù sau.', refType: NotificationRefType.CLASS, refId: firstClass._id },
    { userId: firstClass.teacherId, type: NotificationType.SESSION_CANCELLED, title: 'Buổi dạy bị hủy', body: 'Buổi dạy ngày 14/10 lớp GT-A1-01 đã được hủy.', refType: NotificationRefType.CLASS, refId: firstClass._id },
    { userId: staffs[0]._id, type: NotificationType.ATTENDANCE_WARNING, title: 'Học viên vắng nhiều', body: `${students[1].fullName} vắng vượt ngưỡng 20% ở lớp ${classes[enrollIn[1]].code}.`, refType: NotificationRefType.STUDENT, refId: students[1]._id },
    { userId: manager._id, type: NotificationType.DISCOUNT_DECIDED, title: 'Có đề xuất giảm giá chờ duyệt', body: 'Nhân viên học vụ đề xuất giảm 10% học phí cho một học viên.', refType: NotificationRefType.INVOICE, refId: invoices[0]._id },
  ]);

  return 'created';
}

function addDaysDate(d: Date, n: number): Date {
  return day(addVnDays(isoDay(d), n));
}
function isoDay(d: Date): string {
  return toDateOnly(d);
}
function isoWeekday(d: string): number {
  const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
  return wd === 0 ? 7 : wd;
}

async function main(): Promise<void> {
  const env = loadEnv();
  await connect(env.MONGODB_URI);
  try {
    const result = await seedDemo(connection, { reset: process.argv.includes('--reset') });
    console.log(result === 'created'
      ? `Demo data created. All demo accounts use password: ${DEMO_PASSWORD}`
      : 'Demo data already present (manager@center.local exists). Use --reset to recreate.');
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
