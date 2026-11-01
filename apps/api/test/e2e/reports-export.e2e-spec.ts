import * as ExcelJS from 'exceljs';
import { ALL_ROLES, Role } from '@lc/shared';
import { makeClass, makeCourse, makeInvoice, makeLead, makePayment } from '../factories';
import { loginAs } from '../helpers/auth';
import { pdfText } from '../helpers/pdf-text';
import { createTestApp, TestApp } from '../helpers/test-app';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FROM = '2026-02-01';
const TO = '2026-02-28';

describe('FR-RPT-05 Xuất báo cáo (GET /reports/:type/export)', () => {
  let t: TestApp;
  let manager: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const exp = (token: string, type: string, qs: string) =>
    t.http().get(`/api/v1/reports/${type}/export?${qs}`).set(auth(token)).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
  const sheet = async (buf: Buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    return wb.worksheets[0];
  };

  beforeAll(async () => {
    t = await createTestApp();
    manager = (await loginAs(t, Role.MANAGER)).token;
    const c1 = await makeCourse(t.conn);
    const c2 = await makeCourse(t.conn);
    await makeLead(t.conn, { interestedCourseId: c1._id, createdAt: new Date('2026-02-10T03:00:00Z') } as never);
    await makeLead(t.conn, { interestedCourseId: c2._id, createdAt: new Date('2026-02-11T03:00:00Z') } as never);
    // a class with no graded assessment in range: the academic report still lists it with 0 students
    await makeClass(t.conn, { courseId: c1._id });
    const inv = await makeInvoice(t.conn, { courseId: c1._id, amountDue: 1_234_500, finalAmount: 1_234_500, balance: 1_234_500 });
    await t.conn.collection('invoices').updateOne({ _id: inv._id }, { $set: { createdAt: new Date('2026-02-12T03:00:00Z') } });
    await makePayment(t.conn, { invoiceId: inv._id, amount: 234_500, paidAt: new Date('2026-02-13T03:00:00Z') });
  });
  afterAll(() => t.close());

  it('FR-RPT-05 xlsx mở được bằng exceljs, header đúng, số dòng = rows.length + 1', async () => {
    const json = await t.http().get(`/api/v1/reports/admissions?from=${FROM}&to=${TO}`).set(auth(manager));
    const rows = json.body.data.rows as unknown[];
    expect(rows.length).toBe(2);
    const res = await exp(manager, 'admissions', `format=xlsx&from=${FROM}&to=${TO}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(XLSX);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="bao-cao-admissions-${FROM}-${TO}.xlsx"`);
    const ws = await sheet(res.body as Buffer);
    expect(ws.rowCount).toBe(rows.length + 1);
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Khóa học', 'Lead', 'Hồ sơ mới', 'Tỷ lệ chuyển đổi', 'Đã ghi danh', 'Chờ xếp lớp',
    ]);
  });

  it('FR-RPT-05 pdf content-type đúng, pdfText chứa tiêu đề báo cáo', async () => {
    const res = await exp(manager, 'admissions', `format=pdf&from=${FROM}&to=${TO}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="bao-cao-admissions-${FROM}-${TO}.pdf"`);
    expect(await pdfText(res.body as Buffer)).toContain('Báo cáo tuyển sinh');
  });

  it.each(['attendance', 'academic', 'finance'])('FR-RPT-05 xuất %s xlsx và pdf thành công', async (type) => {
    const x = await exp(manager, type, `format=xlsx&from=${FROM}&to=${TO}`);
    expect(x.status).toBe(200);
    expect((await sheet(x.body as Buffer)).rowCount).toBeGreaterThanOrEqual(2);
    const p = await exp(manager, type, `format=pdf&from=${FROM}&to=${TO}`);
    expect(p.status).toBe(200);
    expect(p.headers['content-type']).toContain('application/pdf');
  });

  it('FR-RPT-05 khoảng không dữ liệu: xlsx 2 dòng (header + "Không có dữ liệu"), pdf chứa "Không có dữ liệu"', async () => {
    const q = 'from=2020-01-01&to=2020-01-31';
    const x = await exp(manager, 'admissions', `format=xlsx&${q}`);
    expect(x.status).toBe(200);
    const ws = await sheet(x.body as Buffer);
    expect(ws.rowCount).toBe(2);
    expect(ws.getRow(2).getCell(1).value).toBe('Không có dữ liệu');
    const p = await exp(manager, 'attendance', `format=pdf&${q}`);
    expect(await pdfText(p.body as Buffer)).toContain('Không có dữ liệu');
  });

  it('FR-RPT-03/05 học tập: lớp không có điểm trong khoảng (students 0) → xuất "Không có dữ liệu"', async () => {
    const json = await t.http().get(`/api/v1/reports/academic?from=${FROM}&to=${TO}`).set(auth(manager));
    expect(json.body.data.rows.length).toBeGreaterThan(0);
    expect(json.body.data.rows.every((r: { students: number }) => r.students === 0)).toBe(true);
    const ws = await sheet((await exp(manager, 'academic', `format=xlsx&from=${FROM}&to=${TO}`)).body as Buffer);
    expect(ws.rowCount).toBe(2);
    expect(ws.getRow(2).getCell(1).value).toBe('Không có dữ liệu');
    const p = await exp(manager, 'academic', `format=pdf&from=${FROM}&to=${TO}`);
    expect(await pdfText(p.body as Buffer)).toContain('Không có dữ liệu');
  });

  it('FR-RPT-04/05 tài chính: pdf định dạng tiền VND, xlsx giữ số', async () => {
    const p = await exp(manager, 'finance', `format=pdf&from=${FROM}&to=${TO}`);
    const text = await pdfText(p.body as Buffer);
    expect(text).toContain('1.234.500');
    expect(text).toContain('234.500');
    expect(text).not.toContain('1234500');
    const ws = await sheet((await exp(manager, 'finance', `format=xlsx&from=${FROM}&to=${TO}`)).body as Buffer);
    expect(ws.getRow(2).getCell(2).value).toBe(234_500); // Doanh thu
    expect(ws.getRow(2).getCell(3).value).toBe(1_234_500); // Tổng phải thu
  });

  it('FR-RPT-05 type lạ → 400, lỗi vẫn là JSON', async () => {
    const res = await t.http().get(`/api/v1/reports/payroll/export?format=xlsx&from=${FROM}&to=${TO}`).set(auth(manager));
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('FR-RPT-05 format lạ → 400, to < from → 400', async () => {
    const a = await t.http().get(`/api/v1/reports/finance/export?format=csv&from=${FROM}&to=${TO}`).set(auth(manager));
    expect(a.status).toBe(400);
    const b = await t.http().get(`/api/v1/reports/finance/export?format=pdf&from=${TO}&to=${FROM}`).set(auth(manager));
    expect(b.status).toBe(400);
    expect(b.headers['content-type']).toContain('application/json');
  });

  it('FR-RPT-05 export không che 4 route báo cáo', async () => {
    const res = await t.http().get(`/api/v1/reports/finance?from=${FROM}&to=${TO}`).set(auth(manager));
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toBeDefined();
  });

  it.each(ALL_ROLES.filter((r) => r !== Role.MANAGER && r !== Role.ACADEMIC_STAFF))('FR-RPT-05 %s → 403', async (role) => {
    const { token } = await loginAs(t, role);
    const res = await t.http().get(`/api/v1/reports/finance/export?format=xlsx&from=${FROM}&to=${TO}`).set(auth(token));
    expect(res.status).toBe(403);
  });

  it('FR-RPT-05 ACADEMIC_STAFF xuất được', async () => {
    const { token } = await loginAs(t, Role.ACADEMIC_STAFF);
    expect((await exp(token, 'finance', `format=xlsx&from=${FROM}&to=${TO}`)).status).toBe(200);
  });
});
