import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { Role } from '@lc/shared';
import { AuditService } from '../../src/common/audit/audit.service';
import { Models } from '../../src/database/models';
import { makeStudent } from '../factories';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';

/** One app per file: AuditService is replaced so the audit write can be made to fail. */
describe('R-AUDIT ghi học viên và audit là nguyên tử (FR-STU-03, FR-ADM-06)', () => {
  let t: TestApp;
  let uploadDir: string;
  let manager: string;
  let failAudit = false;
  const audit = {
    log: async () => {
      if (failAudit) throw new Error('audit down');
    },
  };
  const API = '/api/v1/students';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const pdf = () => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(100, 0x61)]);
  const studentDir = (id: Types.ObjectId) => path.join(uploadDir, 'students', id.toString());
  const filesOf = (id: Types.ObjectId) => (fs.existsSync(studentDir(id)) ? fs.readdirSync(studentDir(id)) : []);
  const load = (id: Types.ObjectId) =>
    t.conn.model(Models.Student).findById(id).lean() as unknown as Promise<{ fullName: string; phone: string; documents: Array<{ _id: Types.ObjectId }> }>;

  beforeAll(async () => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-upload-'));
    process.env.UPLOAD_DIR = uploadDir;
    t = await createTestApp({ overrides: [{ provide: AuditService, useValue: audit }] });
    manager = (await loginAs(t, Role.MANAGER)).token;
  });
  beforeEach(() => {
    failAudit = false;
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await t.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  it('PATCH /students/:id: audit lỗi -> không đổi học viên, không đổi tên tài khoản', async () => {
    const st = await makeStudent(t.conn, { withUser: true, fullName: 'Tên Cũ' });
    failAudit = true;
    await t.http().patch(`${API}/${st._id}`).set(auth(manager)).send({ fullName: 'Tên Mới' }).expect(500);
    expect((await load(st._id)).fullName).toBe('Tên Cũ');
    const user = (await t.conn.model(Models.User).findById(st.userId).lean()) as unknown as { fullName: string };
    expect(user.fullName).toBe('Tên Cũ');
  });

  it('PATCH /students/me/contact: audit lỗi -> không đổi SĐT', async () => {
    const st = await makeStudent(t.conn, { phone: '0912000111' });
    const { token } = await loginAs(t, Role.STUDENT, { studentId: st._id });
    failAudit = true;
    await t.http().patch(`${API}/me/contact`).set(auth(token)).send({ phone: '0912000222' }).expect(500);
    expect((await load(st._id)).phone).toBe('0912000111');
  });

  it('upload: audit lỗi -> không có bản ghi giấy tờ, tệp đã ghi bị xóa', async () => {
    const st = await makeStudent(t.conn);
    failAudit = true;
    await t.http().post(`${API}/${st._id}/documents`).set(auth(manager))
      .attach('file', pdf(), { filename: 'a.pdf', contentType: 'application/pdf' }).expect(500);
    expect((await load(st._id)).documents).toHaveLength(0);
    expect(filesOf(st._id)).toEqual([]);
  });

  it('xóa giấy tờ: audit lỗi -> bản ghi và tệp còn nguyên', async () => {
    const st = await makeStudent(t.conn);
    const up = await t.http().post(`${API}/${st._id}/documents`).set(auth(manager))
      .attach('file', pdf(), { filename: 'a.pdf', contentType: 'application/pdf' }).expect(201);
    failAudit = true;
    await t.http().delete(`${API}/${st._id}/documents/${up.body.data.id}`).set(auth(manager)).expect(500);
    expect((await load(st._id)).documents).toHaveLength(1);
    expect(filesOf(st._id)).toEqual([`${up.body.data.id}.pdf`]);
  });
});
