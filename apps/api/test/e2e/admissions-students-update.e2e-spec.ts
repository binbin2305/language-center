import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Types } from 'mongoose';
import { Role } from '@lc/shared';
import { loginAs } from '../helpers/auth';
import { Models } from '../../src/database/models';
import { createTestApp, TestApp } from '../helpers/test-app';
import { DEFAULT_PASSWORD, makeStudent } from '../factories';

describe('FR-STU-03/04 FR-ADM-06 Cập nhật hồ sơ, giấy tờ, lịch sử', () => {
  let t: TestApp;
  let uploadDir: string;
  let manager: { token: string; id: Types.ObjectId };
  let staff: string;
  let admin: string;
  let teacher: string;
  let hvToken: string;
  let hv: Awaited<ReturnType<typeof makeStudent>>;
  let other: Awaited<ReturnType<typeof makeStudent>>;
  let deleted: Awaited<ReturnType<typeof makeStudent>>;
  let deletedDocId: Types.ObjectId;

  const API = '/api/v1/students';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const pdf = (n = 1024) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(n - 9, 0x61)]);
  const upload = (token: string, id: string | Types.ObjectId, buf: Buffer, name: string, type: string) =>
    t.http().post(`${API}/${id}/documents`).set(auth(token)).attach('file', buf, { filename: name, contentType: type });
  const db = () => t.conn.model(Models.Student);

  beforeAll(async () => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-upload-'));
    process.env.UPLOAD_DIR = uploadDir;
    t = await createTestApp();
    const m = await loginAs(t, Role.MANAGER);
    manager = { token: m.token, id: m.user._id };
    staff = (await loginAs(t, Role.ACADEMIC_STAFF)).token;
    admin = (await loginAs(t, Role.ADMIN)).token;
    teacher = (await loginAs(t, Role.TEACHER)).token;
    hv = await makeStudent(t.conn, { fullName: 'Nguyễn Văn A', phone: '0912345701', email: 'hv.a@mail.com', code: 'HV2026B0001' });
    other = await makeStudent(t.conn, { fullName: 'Trần Khác', phone: '0912345702', email: 'khac@mail.com', code: 'HV2026B0002' });
    deletedDocId = new Types.ObjectId();
    deleted = await makeStudent(t.conn, {
      fullName: 'Đã Xóa',
      code: 'HV2026B0003',
      deletedAt: new Date(),
      documents: [
        { _id: deletedDocId, fileName: 'x.pdf', mimeType: 'application/pdf', size: 10, path: 'students/x/x.pdf', uploadedAt: new Date(), uploadedBy: m.user._id },
      ],
    });
    hvToken = (await loginAs(t, Role.STUDENT, { studentId: hv._id })).token;
  });
  afterAll(async () => {
    await t.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  describe('PATCH /students/:id', () => {
    it('đổi fullName -> audit before/after chỉ chứa trường đổi; q theo tên mới (không dấu) tìm thấy', async () => {
      const res = await t.http().patch(`${API}/${hv._id}`).set(auth(manager.token)).send({ fullName: 'Lương Thế Vinh' }).expect(200);
      expect(res.body.data.student.fullName).toBe('Lương Thế Vinh');
      expect(res.body.data.warnings).toBeUndefined();
      const found = await t.http().get(`${API}?q=luong%20the`).set(auth(manager.token)).expect(200);
      expect(found.body.data.map((s: { id: string }) => s.id)).toEqual([hv._id.toString()]);
      const old = await t.http().get(`${API}?q=nguyen%20van%20a`).set(auth(manager.token)).expect(200);
      expect(old.body.data).toHaveLength(0);
      const audit = await t.http().get(`${API}/${hv._id}/audit`).set(auth(staff)).expect(200);
      expect(audit.body.data[0]).toMatchObject({
        action: 'update',
        entity: 'student',
        entityId: hv._id.toString(),
        actorId: manager.id.toString(),
        before: { fullName: 'Nguyễn Văn A' },
        after: { fullName: 'Lương Thế Vinh' },
      });
    });

    it('đổi fullName -> tài khoản STUDENT cũng đổi tên (GET /auth/me)', async () => {
      const st = await makeStudent(t.conn, { withUser: true, fullName: 'Tên Cũ' });
      const login = await t.http().post('/api/v1/auth/login').send({ username: st.code, password: DEFAULT_PASSWORD }).expect(200);
      const token = login.body.data.accessToken as string;
      await t.http().patch(`${API}/${st._id}`).set(auth(manager.token)).send({ fullName: 'Tên Mới' }).expect(200);
      const me = await t.http().get('/api/v1/auth/me').set(auth(token)).expect(200);
      expect(me.body.data.fullName).toBe('Tên Mới');
    });

    it('M và S cập nhật được; dob/gender/status/note/address lưu đúng, audit chỉ có trường đổi', async () => {
      await t.http().patch(`${API}/${hv._id}`).set(auth(staff))
        .send({ dob: '2000-02-29', note: 'ghi chú', address: 'Hà Nội' }).expect(200);
      const audit = await t.http().get(`${API}/${hv._id}/audit`).set(auth(manager.token)).expect(200);
      expect(audit.body.data[0].after).toEqual({ dob: '2000-02-29', note: 'ghi chú', address: 'Hà Nội' });
      expect(Object.keys(audit.body.data[0].before as object).sort()).toEqual(['address', 'dob', 'note']);
      expect(JSON.stringify(audit.body.data[0])).not.toContain('documents');
    });

    it('đổi SĐT trùng HV khác -> 200, warnings.duplicates[0].kind STUDENT', async () => {
      const res = await t.http().patch(`${API}/${hv._id}`).set(auth(manager.token)).send({ phone: '+84 912 345 702' }).expect(200);
      expect(res.body.data.student.phone).toBe('0912345702');
      expect(res.body.data.warnings.duplicates[0]).toMatchObject({ kind: 'STUDENT', id: other._id.toString() });
      await t.http().patch(`${API}/${hv._id}`).set(auth(manager.token)).send({ phone: '0912345701' }).expect(200);
    });

    it('body có trường lạ -> 400; id sai/không tồn tại/đã xóa -> 404', async () => {
      await t.http().patch(`${API}/${hv._id}`).set(auth(manager.token)).send({ code: 'HV1' }).expect(400);
      await t.http().patch(`${API}/not-an-id`).set(auth(manager.token)).send({ note: 'x' }).expect(404);
      await t.http().patch(`${API}/${new Types.ObjectId()}`).set(auth(manager.token)).send({ note: 'x' }).expect(404);
      await t.http().patch(`${API}/${deleted._id}`).set(auth(manager.token)).send({ note: 'x' }).expect(404);
    });

    it.each([
      ['ADMIN', () => admin],
      ['TEACHER', () => teacher],
      ['STUDENT', () => hvToken],
    ])('%s -> 403', async (_r, tok) => {
      await t.http().patch(`${API}/${hv._id}`).set(auth(tok())).send({ note: 'x' }).expect(403);
    });
  });

  describe('PATCH /students/me/contact', () => {
    it('HV đổi phone -> 200 và audit; warnings khi trùng', async () => {
      const res = await t.http().patch(`${API}/me/contact`).set(auth(hvToken)).send({ phone: '0912345702', address: 'Q1' }).expect(200);
      expect(res.body.data.student).toMatchObject({ phone: '0912345702', address: 'Q1' });
      expect(res.body.data.warnings.duplicates[0].kind).toBe('STUDENT');
      const audit = await t.http().get(`${API}/${hv._id}/audit`).set(auth(manager.token)).expect(200);
      expect(audit.body.data[0]).toMatchObject({ actorRole: 'STUDENT', after: { phone: '0912345702', address: 'Q1' } });
      await t.http().patch(`${API}/me/contact`).set(auth(hvToken)).send({ phone: '0912345701' }).expect(200);
    });
    it('HV gửi fullName -> 400', async () => {
      await t.http().patch(`${API}/me/contact`).set(auth(hvToken)).send({ fullName: 'Hack' }).expect(400);
    });
    it.each([
      ['MANAGER', () => manager.token],
      ['ACADEMIC_STAFF', () => staff],
      ['ADMIN', () => admin],
      ['TEACHER', () => teacher],
    ])('%s -> 403', async (_r, tok) => {
      await t.http().patch(`${API}/me/contact`).set(auth(tok())).send({ phone: '0912345701' }).expect(403);
    });
  });

  describe('tài liệu', () => {
    let docId: string;
    const bytes = pdf(1024);

    it('upload PDF 1KB -> 201, file tồn tại dưới UPLOAD_DIR, DTO không có path, audit không lộ path', async () => {
      const res = await upload(manager.token, hv._id, bytes, 'Giấy khai sinh.pdf', 'application/pdf').expect(201);
      docId = res.body.data.id;
      expect(res.body.data).toMatchObject({ fileName: 'Giấy khai sinh.pdf', mimeType: 'application/pdf', size: 1024, uploadedBy: manager.id.toString() });
      expect(res.body.data.path).toBeUndefined();
      const file = path.join(uploadDir, 'students', hv._id.toString(), `${docId}.pdf`);
      expect(fs.existsSync(file)).toBe(true);
      const detail = await t.http().get(`${API}/${hv._id}`).set(auth(manager.token)).expect(200);
      expect(JSON.stringify(detail.body)).not.toContain('"path"');
      const audit = await t.http().get(`${API}/${hv._id}/audit`).set(auth(manager.token)).expect(200);
      expect(audit.body.data[0]).toMatchObject({ action: 'update', entity: 'student' });
      expect(JSON.stringify(audit.body.data[0])).not.toContain(uploadDir);
      expect(JSON.stringify(audit.body.data[0])).not.toContain('"path"');
    });

    it('tải về đúng bytes, Content-Type và Content-Disposition', async () => {
      const res = await t.http().get(`${API}/${hv._id}/documents/${docId}`).set(auth(staff)).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(Buffer.compare(res.body as Buffer, bytes)).toBe(0);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toBe(`attachment; filename*=UTF-8''${encodeURIComponent('Giấy khai sinh.pdf')}`);
    });

    it('6MB -> 400 FILE_TOO_LARGE; đúng 5MB+1 byte cũng bị từ chối', async () => {
      const big = await upload(manager.token, hv._id, pdf(6 * 1024 * 1024), 'big.pdf', 'application/pdf').expect(400);
      expect(big.body.error.code).toBe('FILE_TOO_LARGE');
      const edge = await upload(manager.token, hv._id, pdf(5 * 1024 * 1024 + 1), 'edge.pdf', 'application/pdf').expect(400);
      expect(edge.body.error.code).toBe('FILE_TOO_LARGE');
      await upload(manager.token, hv._id, pdf(5 * 1024 * 1024), 'ok.pdf', 'application/pdf').expect(201);
    });

    it('.exe / mime sai / đuôi không khớp mime -> 400 FILE_TYPE_NOT_ALLOWED', async () => {
      for (const [name, type] of [
        ['virus.exe', 'application/x-msdownload'],
        ['virus.pdf', 'application/x-msdownload'],
        ['virus.exe', 'application/pdf'],
        ['anh.png', 'application/pdf'],
        ['noext', 'application/pdf'],
      ]) {
        const res = await upload(manager.token, hv._id, pdf(), name, type).expect(400);
        expect(res.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');
      }
      await upload(manager.token, hv._id, Buffer.from('x'), 'a.JPG', 'image/jpeg').expect(201);
      await upload(manager.token, hv._id, Buffer.from('x'), 'b.png', 'image/png').expect(201);
    });

    it('thiếu file -> 400 VALIDATION_FAILED fields.file', async () => {
      const res = await t.http().post(`${API}/${hv._id}/documents`).set(auth(manager.token)).field('x', 'y').expect(400);
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_FAILED', details: { fields: { file: expect.any(String) } } });
    });

    it('tên file chứa ../ không thoát khỏi UPLOAD_DIR', async () => {
      const res = await upload(manager.token, hv._id, pdf(), '../../evil.pdf', 'application/pdf').expect(201);
      const file = path.join(uploadDir, 'students', hv._id.toString(), `${res.body.data.id}.pdf`);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.existsSync(path.join(uploadDir, '..', 'evil.pdf'))).toBe(false);
    });

    it('xóa -> 204, bản ghi và file bị xóa; xóa lại -> 404; file đã mất vẫn xóa được', async () => {
      const file = path.join(uploadDir, 'students', hv._id.toString(), `${docId}.pdf`);
      await t.http().delete(`${API}/${hv._id}/documents/${docId}`).set(auth(staff)).expect(204);
      expect(fs.existsSync(file)).toBe(false);
      await t.http().get(`${API}/${hv._id}/documents/${docId}`).set(auth(staff)).expect(404);
      await t.http().delete(`${API}/${hv._id}/documents/${docId}`).set(auth(staff)).expect(404);
      const again = await upload(manager.token, hv._id, pdf(), 'm.pdf', 'application/pdf').expect(201);
      fs.rmSync(path.join(uploadDir, 'students', hv._id.toString(), `${again.body.data.id}.pdf`));
      await t.http().delete(`${API}/${hv._id}/documents/${again.body.data.id}`).set(auth(manager.token)).expect(204);
      const audit = await t.http().get(`${API}/${hv._id}/audit`).set(auth(manager.token)).expect(200);
      expect(JSON.stringify(audit.body.data)).not.toContain(uploadDir);
    });

    it('HV khác / id lạ / HV đã xóa -> 404', async () => {
      await t.http().get(`${API}/${other._id}/documents/${new Types.ObjectId()}`).set(auth(manager.token)).expect(404);
      await t.http().get(`${API}/${hv._id}/documents/bad`).set(auth(manager.token)).expect(404);
      await upload(manager.token, deleted._id, pdf(), 'a.pdf', 'application/pdf').expect(404);
      await t.http().get(`${API}/${deleted._id}/documents/${deletedDocId}`).set(auth(manager.token)).expect(404);
      await t.http().delete(`${API}/${deleted._id}/documents/${deletedDocId}`).set(auth(manager.token)).expect(404);
      await t.http().get(`${API}/${deleted._id}/audit`).set(auth(manager.token)).expect(404);
      const doc = (await db().findById(deleted._id).lean()) as unknown as { documents: unknown[] };
      expect(doc.documents).toHaveLength(1);
    });

    it.each([
      ['ADMIN', () => admin],
      ['TEACHER', () => teacher],
      ['STUDENT', () => hvToken],
    ])('%s -> 403 trên upload/download/delete', async (_r, tok) => {
      const id = new Types.ObjectId();
      await upload(tok(), hv._id, pdf(), 'a.pdf', 'application/pdf').expect(403);
      await t.http().get(`${API}/${hv._id}/documents/${id}`).set(auth(tok())).expect(403);
      await t.http().delete(`${API}/${hv._id}/documents/${id}`).set(auth(tok())).expect(403);
    });
  });

  describe('GET /students/:id/audit', () => {
    it('mới nhất trước, phân trang', async () => {
      t.clock.advance(60_000);
      await t.http().patch(`${API}/${other._id}`).set(auth(manager.token)).send({ note: 'một' }).expect(200);
      t.clock.advance(60_000);
      await t.http().patch(`${API}/${other._id}`).set(auth(manager.token)).send({ note: 'hai' }).expect(200);
      const res = await t.http().get(`${API}/${other._id}/audit?limit=1`).set(auth(staff)).expect(200);
      expect(res.body.meta).toMatchObject({ page: 1, limit: 1, total: 2 });
      expect(res.body.data[0].after).toEqual({ note: 'hai' });
      const p2 = await t.http().get(`${API}/${other._id}/audit?limit=1&page=2`).set(auth(staff)).expect(200);
      expect(p2.body.data[0].after).toEqual({ note: 'một' });
    });
    it.each([
      ['ADMIN', () => admin],
      ['TEACHER', () => teacher],
      ['STUDENT', () => hvToken],
    ])('%s -> 403', async (_r, tok) => {
      await t.http().get(`${API}/${hv._id}/audit`).set(auth(tok())).expect(403);
    });
  });
});
