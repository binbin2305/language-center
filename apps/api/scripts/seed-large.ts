import '../src/config/load-dotenv';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  AttendanceStatus,
  ClassStatus,
  EnrollmentStatus,
  Gender,
  InvoiceKind,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
  addVnDays,
  fromDateOnly,
  startOfVnDay,
  vnDateTime,
  vnDay,
} from '@lc/shared';
import { AppModule } from '../src/app.module';
import { Models } from '../src/database/models';
import { hashPassword } from '../src/modules/auth/password';
import { DEMO_PASSWORD } from './seed-demo';

/**
 * NFR-02 volume data: raw inserts (no services, for speed) that still carry every Wave 2 field:
 * enrollments have classHistory and a class-stamped ENROLLED history entry, attendance carries
 * classId/enrollmentId, invoices satisfy the BACKEND_SCHEMA §2.16 invariants, currentSize = seats.
 * Each class gets its own teacher/room slot so the schedule has no conflicts.
 * Usage: SEED_STUDENTS=5000 SEED_CLASSES=200 pnpm --filter api seed:large
 */
export interface SeedLargeOptions {
  students: number;
  classes: number;
  /** VN day the data is relative to (default: today). */
  today?: string;
}

const SLOTS: { weekdays: number[]; time: [string, string] }[] = [];
for (const weekdays of [[1, 3], [2, 4], [5, 6]]) {
  for (const time of [['08:00', '09:30'], ['10:00', '11:30'], ['14:00', '15:30'], ['16:00', '17:30']] as [string, string][]) {
    SLOTS.push({ weekdays, time });
  }
}
const LAST = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'];
const FIRST = ['An', 'Bình', 'Dũng', 'Hà', 'Linh', 'Mai', 'Nam', 'Trang', 'Tuấn', 'Vy'];
const CHUNK = 5000;
const pad = (n: number, w: number) => String(n).padStart(w, '0');

function weekdayOf(d: string): number {
  const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
  return wd === 0 ? 7 : wd;
}

async function insertChunked(model: Model<unknown>, docs: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < docs.length; i += CHUNK) await model.insertMany(docs.slice(i, i + CHUNK));
}

export async function runSeedLarge(conn: Connection, opts: SeedLargeOptions): Promise<{ status: 'created' | 'exists'; students: number; classes: number }> {
  const m = (name: keyof typeof Models) => conn.models[Models[name]] as Model<unknown>;
  if (await m('Class').exists({ code: /^L-/ })) return { status: 'exists', students: 0, classes: 0 };
  const today = opts.today ?? vnDay(new Date());
  const todayStart = startOfVnDay(today);
  const hash = await hashPassword(DEMO_PASSWORD);
  const id = () => new Types.ObjectId();

  const actor = (await conn.models[Models.User].findOne({ role: { $in: [Role.ADMIN, Role.ACADEMIC_STAFF] } }, { _id: 1 }).lean<{ _id: Types.ObjectId }>())?._id ?? id();
  const course = { _id: id(), code: 'LARGE', name: 'Khóa dữ liệu lớn', language: 'Tiếng Anh', levels: ['A1'], totalSessions: 16, baseFee: 3_000_000 };
  await m('Course').insertMany([course]);

  // One teacher + room per 12 classes; each class takes one distinct slot of its teacher/room.
  const resources = Math.ceil(opts.classes / SLOTS.length);
  const teachers = Array.from({ length: resources }, (_, r) => ({
    _id: id(), username: `teacher.l${r + 1}@center.local`, email: `teacher.l${r + 1}@center.local`, fullName: `Giáo viên L${r + 1}`,
    role: Role.TEACHER, passwordHash: hash, mustChangePassword: false, teacherProfile: { languages: ['Tiếng Anh'], levels: ['A1'] },
  }));
  const rooms = Array.from({ length: resources }, (_, r) => ({ _id: id(), code: `PL${pad(r + 1, 3)}`, name: `Phòng L${r + 1}`, capacity: 100 }));
  await m('User').insertMany(teachers);
  await m('Room').insertMany(rooms);

  const start = addVnDays(today, -28);
  const end = addVnDays(today, 27);
  const capacity = Math.min(100, Math.max(20, Math.ceil(opts.students / opts.classes)));
  const classes = Array.from({ length: opts.classes }, (_, c) => ({
    _id: id(), code: `L-${pad(c + 1, 4)}`, name: `Lớp dữ liệu lớn ${c + 1}`, courseId: course._id, level: 'A1',
    teacherId: teachers[Math.floor(c / SLOTS.length)]._id, defaultRoomId: rooms[Math.floor(c / SLOTS.length)]._id,
    maxCapacity: capacity, currentSize: 0, startDate: fromDateOnly(start), endDate: fromDateOnly(end), status: ClassStatus.ONGOING,
    createdBy: actor,
  }));

  const students: Record<string, unknown>[] = [];
  const users: Record<string, unknown>[] = [];
  const enrollments: Record<string, unknown>[] = [];
  const roster = new Map<number, { _id: Types.ObjectId; studentId: Types.ObjectId }[]>();
  const invoices: Record<string, unknown>[] = [];
  const payments: Record<string, unknown>[] = [];
  const enrolledAt = vnDateTime(addVnDays(start, -3), '09:00');
  for (let i = 0; i < opts.students; i++) {
    const n = i + 1;
    const code = `HVL${pad(n, 6)}`;
    const studentId = id();
    const userId = id();
    const fullName = `${LAST[i % LAST.length]} Văn ${FIRST[(i * 7) % FIRST.length]}`;
    students.push({ _id: studentId, code, fullName, dob: fromDateOnly(`${2000 + (i % 12)}-0${1 + (i % 9)}-1${i % 9}`), gender: i % 2 ? Gender.MALE : Gender.FEMALE, phone: `07${pad(n, 8)}`, userId, createdBy: actor });
    users.push({ _id: userId, username: code, fullName, role: Role.STUDENT, studentId, passwordHash: hash, mustChangePassword: false });

    const classIdx = i % opts.classes;
    const cls = classes[classIdx];
    if (cls.currentSize >= cls.maxCapacity) continue; // full classes leave the rest unseated
    cls.currentSize += 1;
    const enrollmentId = id();
    const invoiceId = id();
    enrollments.push({
      _id: enrollmentId, studentId, courseId: course._id, classId: cls._id, status: EnrollmentStatus.ENROLLED,
      placementLevel: 'A1', waitingSince: vnDateTime(addVnDays(start, -7), '09:00'), enrolledAt, confirmedAt: enrolledAt,
      classHistory: [cls._id], invoiceId,
      history: [
        { from: null, to: EnrollmentStatus.PENDING_PLACEMENT, at: vnDateTime(addVnDays(start, -10), '09:00'), by: actor },
        { from: EnrollmentStatus.PENDING_PLACEMENT, to: EnrollmentStatus.WAITING_CLASS, at: vnDateTime(addVnDays(start, -7), '09:00'), by: actor },
        { from: EnrollmentStatus.WAITING_CLASS, to: EnrollmentStatus.ENROLLED, at: enrolledAt, by: actor, classId: cls._id },
      ],
    });
    roster.set(classIdx, [...(roster.get(classIdx) ?? []), { _id: enrollmentId, studentId }]);
    const fee = course.baseFee;
    const paid = [fee, Math.round(fee / 2), 0][i % 3];
    invoices.push({
      _id: invoiceId, code: `HDL${pad(n, 7)}`, kind: InvoiceKind.TUITION, studentId, enrollmentId, courseId: course._id, classId: cls._id,
      amountDue: fee, finalAmount: fee, amountPaid: paid, balance: fee - paid, dueDate: fromDateOnly(addVnDays(start, 7)),
      status: paid === fee ? InvoiceStatus.PAID : paid > 0 ? InvoiceStatus.PARTIAL : InvoiceStatus.UNPAID,
    });
    if (paid > 0) {
      payments.push({
        code: `PTL${pad(n, 7)}`, invoiceId, studentId, amount: paid, method: PaymentMethod.CASH, status: PaymentStatus.VALID,
        paidAt: vnDateTime(addVnDays(start, i % 7), '10:00'), recordedBy: actor,
      });
    }
  }

  const sessions: Record<string, unknown>[] = [];
  const attendances: Record<string, unknown>[] = [];
  classes.forEach((cls, c) => {
    const slot = SLOTS[c % SLOTS.length];
    for (let d = start; d <= end; d = addVnDays(d, 1)) {
      if (!slot.weekdays.includes(weekdayOf(d))) continue;
      const startAt = vnDateTime(d, slot.time[0]);
      const endAt = vnDateTime(d, slot.time[1]);
      const taken = startAt < todayStart;
      const sessionId = id();
      sessions.push({ _id: sessionId, classId: cls._id, roomId: cls.defaultRoomId, teacherId: cls.teacherId, startAt, endAt, attendanceTakenAt: taken ? endAt : null, createdBy: actor });
      if (!taken) continue;
      for (const [k, e] of (roster.get(c) ?? []).entries()) {
        attendances.push({
          sessionId, classId: cls._id, studentId: e.studentId, enrollmentId: e._id,
          status: (k + sessions.length) % 17 === 0 ? AttendanceStatus.UNEXCUSED : AttendanceStatus.PRESENT, recordedBy: cls.teacherId,
        });
      }
    }
  });

  await m('Class').insertMany(classes);
  await insertChunked(m('Student'), students);
  await insertChunked(m('User'), users);
  await insertChunked(m('Enrollment'), enrollments);
  await insertChunked(m('Invoice'), invoices);
  await insertChunked(m('Payment'), payments);
  await insertChunked(m('Session'), sessions);
  await insertChunked(m('Attendance'), attendances);
  return { status: 'created', students: opts.students, classes: opts.classes };
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : fallback;
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

async function main(): Promise<void> {
  const students = envInt('SEED_STUDENTS', 5000);
  const classes = envInt('SEED_CLASSES', 200);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const res = await runSeedLarge(app.get<Connection>(getConnectionToken()), { students, classes });
    console.log(res.status === 'created' ? `Large data created: ${students} students, ${classes} classes.` : 'Large data already present (classes L-*).');
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
