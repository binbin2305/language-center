import { ClassStatus, EnrollmentStatus, InvoiceStatus, Role, SessionStatus } from '@lc/shared';
import {
  makeClass,
  makeEnrollment,
  makeInvoice,
  makeLead,
  makeRoom,
  makeSession,
  makeStudent,
  makeTeacher,
} from '../factories';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

// DEFAULT_NOW = 2026-01-05 09:00 VN. Today (VN) = 2026-01-05.
const vn = (d: string, hhmm = '00:00') => new Date(`${d}T${hhmm}:00+07:00`);

describe('FR-RPT-06 Tổng quan (GET /reports/dashboard)', () => {
  let t: TestApp;
  let teacherName: string;
  let roomCode: string;
  let takenClassCode: string;
  let decLeadsOnly: number;

  beforeAll(async () => {
    t = await createTestApp();
    const setCreatedAt = (coll: string, id: unknown, at: Date) =>
      t.conn.collection(coll).updateOne({ _id: id as never }, { $set: { createdAt: at } });

    const teacher = await makeTeacher(t.conn, { fullName: 'Cô Lan' });
    teacherName = teacher.fullName;
    const room = await makeRoom(t.conn);
    roomCode = room.code;

    const c1 = await makeClass(t.conn, { status: ClassStatus.PLANNED, teacherId: teacher._id, defaultRoomId: room._id });
    const c2 = await makeClass(t.conn, { status: ClassStatus.ONGOING });
    await makeClass(t.conn, { status: ClassStatus.FINISHED });
    await makeClass(t.conn, { status: ClassStatus.INACTIVE });
    takenClassCode = c1.code;

    // 3 HV ENROLLED, s1 học 2 lớp -> activeStudents 3
    const [s1, s2, s3, s4] = [await makeStudent(t.conn), await makeStudent(t.conn), await makeStudent(t.conn), await makeStudent(t.conn)];
    await makeEnrollment(t.conn, { studentId: s1._id, classId: c1._id, status: EnrollmentStatus.ENROLLED });
    await makeEnrollment(t.conn, { studentId: s1._id, classId: c2._id, status: EnrollmentStatus.ENROLLED });
    await makeEnrollment(t.conn, { studentId: s2._id, classId: c2._id, status: EnrollmentStatus.ENROLLED });
    await makeEnrollment(t.conn, { studentId: s3._id, classId: c1._id, status: EnrollmentStatus.ENROLLED });
    await makeEnrollment(t.conn, { studentId: s4._id, classId: c1._id, status: EnrollmentStatus.COMPLETED });
    // 2 WAITING_CLASS
    await makeEnrollment(t.conn, { status: EnrollmentStatus.WAITING_CLASS });
    await makeEnrollment(t.conn, { status: EnrollmentStatus.WAITING_CLASS });

    // Sessions: 09:00 (đã điểm danh) & 23:30 hôm nay đếm; 00:30 ngày mai, 23:30 hôm qua, CANCELLED không
    await makeSession(t.conn, { classId: c1._id, roomId: room._id, teacherId: teacher._id, startAt: vn('2026-01-05', '09:00'), endAt: vn('2026-01-05', '10:00'), attendanceTakenAt: new Date('2026-01-05T03:00:00Z') });
    await makeSession(t.conn, { classId: c2._id, startAt: vn('2026-01-05', '23:30'), endAt: vn('2026-01-05', '23:59') });
    await makeSession(t.conn, { classId: c2._id, startAt: vn('2026-01-06', '00:30'), endAt: vn('2026-01-06', '01:30') });
    await makeSession(t.conn, { classId: c2._id, startAt: vn('2026-01-04', '23:30'), endAt: vn('2026-01-04', '23:59') });
    await makeSession(t.conn, { classId: c1._id, startAt: vn('2026-01-05', '14:00'), endAt: vn('2026-01-05', '15:00'), status: SessionStatus.CANCELLED, cancelReason: 'Nghỉ' });

    // Hóa đơn: 2 quá hạn, 1 đến hạn hôm nay, 1 VOID quá hạn, 1 đã thanh toán đủ
    const overdue = { dueDate: vn('2026-01-04') };
    await makeInvoice(t.conn, overdue);
    await makeInvoice(t.conn, { dueDate: vn('2025-12-20'), amountPaid: 1_000_000, balance: 2_000_000, status: InvoiceStatus.PARTIAL });
    await makeInvoice(t.conn, { dueDate: vn('2026-01-05') });
    await makeInvoice(t.conn, { ...overdue, status: InvoiceStatus.VOID });
    await makeInvoice(t.conn, { ...overdue, amountPaid: 3_000_000, balance: 0, status: InvoiceStatus.PAID });

    // Xu hướng tuyển sinh
    const leadAt = async (at: Date) => setCreatedAt('leads', (await makeLead(t.conn))._id, at);
    await leadAt(vn('2025-12-31', '23:30')); // tháng 12
    await leadAt(vn('2026-01-01', '00:10')); // tháng 1
    await leadAt(vn('2025-08-01', '00:10')); // tháng đầu của cửa sổ
    await leadAt(vn('2025-07-31', '23:30')); // ngoài cửa sổ
    decLeadsOnly = 1;
    await setCreatedAt('students', (await makeStudent(t.conn))._id, vn('2025-12-31', '23:45'));
  });
  afterAll(async () => {
    await t.close();
  });

  const get = (token: string) => t.http().get('/api/v1/reports/dashboard').set({ Authorization: `Bearer ${token}` });

  it('FR-RPT-06 activeStudents đếm HV phân biệt có enrollment ENROLLED (HV 2 lớp chỉ tính 1)', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token);
    expect(r.status).toBe(200);
    expect(r.body.data.activeStudents).toBe(3);
  });

  it('FR-RPT-06 ongoingClasses đếm PLANNED + ONGOING, không đếm FINISHED / INACTIVE', async () => {
    const r = await get((await loginAs(t, Role.ACADEMIC_STAFF)).token);
    expect(r.body.data.ongoingClasses).toBe(2);
  });

  it('FR-RPT-06 sessionsToday đếm 09:00 và 23:30 VN hôm nay, không đếm 00:30 ngày mai / hôm qua / CANCELLED', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token);
    expect(r.body.data.sessionsToday).toBe(2);
    expect(r.body.data.todaySessions).toHaveLength(2);
  });

  it('FR-RPT-06 overdueInvoices khớp GET /invoices?overdue=true meta.total', async () => {
    const { token } = await loginAs(t, Role.MANAGER);
    const dash = await get(token);
    const list = await t.http().get('/api/v1/invoices?overdue=true').set({ Authorization: `Bearer ${token}` });
    expect(list.body.meta.total).toBe(2);
    expect(dash.body.data.overdueInvoices).toBe(list.body.meta.total);
  });

  it('FR-RPT-06 waitingEnrollments đếm enrollment WAITING_CLASS', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token);
    expect(r.body.data.waitingEnrollments).toBe(2);
  });

  it('FR-RPT-06 todaySessions sắp theo startAt, có classCode/roomCode/teacherName/attendanceTaken', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token);
    const [first, second] = r.body.data.todaySessions;
    expect(first).toMatchObject({
      classCode: takenClassCode,
      roomCode,
      teacherName,
      attendanceTaken: true,
      startAt: vn('2026-01-05', '09:00').toISOString(),
    });
    expect(second.attendanceTaken).toBe(false);
    expect(new Date(first.startAt).getTime()).toBeLessThan(new Date(second.startAt).getTime());
  });

  it('FR-RPT-06 admissionsTrend có 6 phần tử, tháng cũ -> mới, lead 31/12 23:30 VN thuộc tháng 12', async () => {
    const r = await get((await loginAs(t, Role.MANAGER)).token);
    const trend = r.body.data.admissionsTrend;
    expect(trend.map((m: { month: string }) => m.month)).toEqual(['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
    const by = Object.fromEntries(trend.map((m: { month: string; leads: number; profiles: number }) => [m.month, m]));
    expect(by['2025-12'].leads).toBe(decLeadsOnly);
    expect(by['2025-12'].profiles).toBe(1);
    expect(by['2026-01'].leads).toBe(1);
    expect(by['2025-08'].leads).toBe(1); // 2025-07-31 23:30 VN nằm ngoài cửa sổ
    expect(by['2025-09'].leads).toBe(0);
  });

  it.each([Role.TEACHER, Role.STUDENT, Role.ADMIN])('FR-RPT-06 %s -> 403', async (role) => {
    await get((await loginAs(t, role)).token).expect(403);
  });

  it('FR-RPT-06 không đăng nhập -> 401', async () => {
    await t.http().get('/api/v1/reports/dashboard').expect(401);
  });
});
