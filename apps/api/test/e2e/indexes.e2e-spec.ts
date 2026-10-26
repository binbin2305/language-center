import { Connection } from 'mongoose';
import { Role } from '@lc/shared';
import { createTestApp, TestApp } from '../helpers/test-app';
import {
  makeAssessment, makeAttendance, makeClass, makeCourse, makeEnrollment, makeGrade, makeInvoice, makeLead,
  makePayment, makePlacementTest, makeRoom, makeSession, makeStudent, makeUser, models,
} from '../factories';

type IndexInfo = { key: Record<string, number>; unique?: boolean; sparse?: boolean; partialFilterExpression?: object; expireAfterSeconds?: number };

async function indexes(conn: Connection, col: string): Promise<IndexInfo[]> {
  return (await conn.collection(col).indexes()) as unknown as IndexInfo[];
}
function find(list: IndexInfo[], key: Record<string, number>): IndexInfo | undefined {
  return list.find((i) => JSON.stringify(i.key) === JSON.stringify(key));
}

describe('schema indexes & factories', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it.each([
    ['users', { username: 1 }],
    ['courses', { code: 1 }],
    ['rooms', { code: 1 }],
    ['students', { code: 1 }],
    ['classes', { code: 1 }],
    ['attendances', { sessionId: 1, studentId: 1 }],
    ['grades', { assessmentId: 1, studentId: 1 }],
    ['invoices', { code: 1 }],
    ['payments', { code: 1 }],
    ['attendance_warnings', { studentId: 1, classId: 1 }],
  ])('%s có unique index %j', async (col, key) => {
    expect(find(await indexes(t.conn, col), key)?.unique).toBe(true);
  });

  it('users.email / users.studentId / students.leadId unique partial ($type)', async () => {
    const users = await indexes(t.conn, 'users');
    expect(find(users, { email: 1 })).toMatchObject({
      unique: true,
      partialFilterExpression: { email: { $type: 'string' } },
    });
    expect(find(users, { studentId: 1 })).toMatchObject({
      unique: true,
      partialFilterExpression: { studentId: { $type: 'objectId' } },
    });
    expect(find(await indexes(t.conn, 'students'), { leadId: 1 })).toMatchObject({
      unique: true,
      partialFilterExpression: { leadId: { $type: 'objectId' } },
    });
  });

  it('hai user email null cùng tồn tại; hai student leadId null cùng tồn tại', async () => {
    const nul = null as unknown as undefined;
    await makeUser(t.conn, { role: Role.TEACHER, email: nul, username: 'null-email-1' });
    await makeUser(t.conn, { role: Role.TEACHER, email: nul, username: 'null-email-2' });
    await makeStudent(t.conn, { leadId: nul });
    await makeStudent(t.conn, { leadId: nul });
  });

  it('invoices.enrollmentId unique partial kind=TUITION', async () => {
    expect(find(await indexes(t.conn, 'invoices'), { enrollmentId: 1 })).toMatchObject({
      unique: true,
      partialFilterExpression: { kind: 'TUITION' },
    });
  });

  it('refresh_tokens có TTL trên expiresAt', async () => {
    expect(find(await indexes(t.conn, 'refresh_tokens'), { expiresAt: 1 })?.expireAfterSeconds).toBe(0);
  });

  it('students.phone KHÔNG unique', async () => {
    const list = await indexes(t.conn, 'students');
    expect(find(list, { phone: 1 })?.unique).toBeFalsy();
    const a = await makeStudent(t.conn, { phone: '0900000001' });
    const b = await makeStudent(t.conn, { phone: '0900000001' });
    expect(a.phone).toBe(b.phone);
  });

  it('students.fullNameSearch tự sinh bỏ dấu + lowercase', async () => {
    const s = await makeStudent(t.conn, { fullName: 'Nguyễn Văn Đạt' });
    expect(s.fullNameSearch).toBe('nguyen van dat');
  });

  it('classes.code lưu uppercase', async () => {
    const c = await makeClass(t.conn, { code: 'eng-a1-01' });
    expect(c.code).toBe('ENG-A1-01');
  });

  it('makeClass tạo đủ course + teacher role TEACHER', async () => {
    const c = await makeClass(t.conn);
    const teacher = await models(t.conn).User.findById(c.teacherId).lean();
    expect(teacher?.role).toBe(Role.TEACHER);
    expect(await models(t.conn).Course.findById(c.courseId)).toBeTruthy();
  });

  it('makeStudent withUser: user STUDENT có studentId, không có email', async () => {
    const s = await makeStudent(t.conn, { withUser: true, email: 'parent@example.com' });
    const u = await models(t.conn).User.findById(s.userId).lean();
    expect(u?.role).toBe(Role.STUDENT);
    expect(String(u?.studentId)).toBe(String(s._id));
    expect(u?.email).toBeUndefined();
    expect(u?.username).toBe(s.code);
  });

  it('hai user STUDENT không email không đụng unique', async () => {
    await makeUser(t.conn, { role: Role.STUDENT });
    await makeUser(t.conn, { role: Role.STUDENT });
  });

  it('clock mặc định 2026-01-05T02:00:00Z', () => {
    expect(t.clock.now().toISOString()).toBe('2026-01-05T02:00:00.000Z');
  });

  it('mọi factory tạo được document hợp lệ', async () => {
    const docs = [
      await makeCourse(t.conn), await makeRoom(t.conn), await makeLead(t.conn), await makeEnrollment(t.conn),
      await makePlacementTest(t.conn), await makeSession(t.conn), await makeAttendance(t.conn),
      await makeAssessment(t.conn), await makeGrade(t.conn), await makeInvoice(t.conn),
      await makeInvoice(t.conn, { kind: 'SURCHARGE' }), await makePayment(t.conn),
    ];
    docs.forEach((d) => expect(d._id).toBeDefined());
  });

  it('một hóa đơn TUITION / enrollment; SURCHARGE không bị ràng buộc', async () => {
    const inv = await makeInvoice(t.conn);
    await expect(makeInvoice(t.conn, { enrollmentId: inv.enrollmentId, studentId: inv.studentId })).rejects.toThrow(/E11000/);
    await makeInvoice(t.conn, { kind: 'SURCHARGE' });
    await makeInvoice(t.conn, { kind: 'SURCHARGE' });
  });

  it('validator: tiền nguyên, điểm bội 0.25, endDate >= startDate', async () => {
    await expect(makeCourse(t.conn, { baseFee: 1.5 })).rejects.toThrow();
    await expect(makeGrade(t.conn, { score: 7.3 })).rejects.toThrow();
    await expect(
      makeClass(t.conn, { startDate: new Date('2026-02-01'), endDate: new Date('2026-01-01') }),
    ).rejects.toThrow();
    await expect(makeClass(t.conn, { maxCapacity: 5, currentSize: 6 })).rejects.toThrow();
  });
});
