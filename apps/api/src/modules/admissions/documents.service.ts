import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Connection, isValidObjectId, Model, Types } from 'mongoose';
import { AuditAction, ErrorCode, StudentDocumentDto } from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { ClockService } from '../../common/clock/clock.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { loadEnv } from '../../config/env';
import { Models } from '../../database/models';
import { Student } from '../../database/schemas/student.schema';
import { StudentLean } from './admissions.mapper';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const EXTENSIONS: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/pdf': ['.pdf'],
};

const MAX_FILE_NAME = 255;

/** Keeps names within MAX_FILE_NAME characters, cutting the stem so the extension survives. */
function capFileName(name: string): string {
  if (name.length <= MAX_FILE_NAME) return name;
  const ext = path.extname(name).slice(0, 16);
  return name.slice(0, MAX_FILE_NAME - ext.length) + ext;
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    @InjectConnection() private readonly conn: Connection,
  ) {}

  /** Absolute path for a stored relative path; throws when it would escape UPLOAD_DIR. */
  private resolve(rel: string): string {
    const root = path.resolve(loadEnv().UPLOAD_DIR);
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep)) throw new AppError(ErrorCode.INTERNAL);
    return abs;
  }

  private parseId(id: string): Types.ObjectId {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    return new Types.ObjectId(id);
  }

  private async unlinkQuietly(abs: string): Promise<void> {
    try {
      await fs.unlink(abs);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') this.logger.error(`Could not delete ${abs}: ${String(e)}`);
    }
  }

  async upload(user: AuthUser, id: string, file: UploadedFile | undefined): Promise<StudentDocumentDto> {
    const studentId = this.parseId(id);
    if (!file) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { file: 'Thiếu tệp tải lên' } });
    }
    if (file.size > MAX_DOCUMENT_BYTES) throw new AppError(ErrorCode.FILE_TOO_LARGE);
    // Drop any directory part (the interceptor already decodes the name as UTF-8).
    const fileName = capFileName(path.basename(file.originalname.replace(/\\/g, '/')));
    const ext = path.extname(fileName).toLowerCase();
    if (!EXTENSIONS[file.mimetype]?.includes(ext)) throw new AppError(ErrorCode.FILE_TYPE_NOT_ALLOWED);

    if (!(await this.students.exists({ _id: studentId, deletedAt: null }))) throw new AppError(ErrorCode.NOT_FOUND);

    const docId = new Types.ObjectId();
    const abs = this.resolve(path.join('students', studentId.toString(), `${docId.toString()}${ext}`));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file.buffer);
    const rel = path.relative(path.resolve(loadEnv().UPLOAD_DIR), abs);
    const uploadedAt = this.clock.now();
    try {
      await withTransaction(this.conn, async (s) => {
        const updated = await this.students.findOneAndUpdate(
          { _id: studentId, deletedAt: null },
          { $push: { documents: { _id: docId, fileName, mimeType: file.mimetype, size: file.size, path: rel, uploadedAt, uploadedBy: user.id } } },
          { new: true, session: s },
        );
        if (!updated) throw new AppError(ErrorCode.NOT_FOUND);
        await this.audit.log(
          {
            actor: user,
            action: AuditAction.UPDATE,
            entity: 'student',
            entityId: studentId,
            before: null,
            after: { documentAdded: { id: docId.toString(), fileName, mimeType: file.mimetype, size: file.size } },
          },
          s,
        );
      });
    } catch (e) {
      // The transaction rolled back: the file written above has no record pointing at it.
      await this.unlinkQuietly(abs);
      throw e;
    }
    return { id: docId.toString(), fileName, mimeType: file.mimetype, size: file.size, uploadedAt: uploadedAt.toISOString(), uploadedBy: user.id.toString() };
  }

  private async find(id: string, docId: string) {
    const studentId = this.parseId(id);
    const did = this.parseId(docId);
    const s = (await this.students.findOne({ _id: studentId, deletedAt: null }).lean()) as StudentLean | null;
    const doc = s?.documents.find((d) => d._id.equals(did));
    if (!s || !doc) throw new AppError(ErrorCode.NOT_FOUND);
    return { studentId, doc };
  }

  async open(id: string, docId: string) {
    const { doc } = await this.find(id, docId);
    const abs = this.resolve(doc.path);
    try {
      await fs.access(abs);
    } catch {
      throw new AppError(ErrorCode.NOT_FOUND);
    }
    return { stream: createReadStream(abs), mimeType: doc.mimeType, fileName: doc.fileName, size: doc.size };
  }

  async remove(user: AuthUser, id: string, docId: string): Promise<void> {
    const { studentId, doc } = await this.find(id, docId);
    await withTransaction(this.conn, async (s) => {
      const res = await this.students.updateOne(
        { _id: studentId, deletedAt: null },
        { $pull: { documents: { _id: doc._id } } },
        { session: s },
      );
      if (res.modifiedCount === 0) throw new AppError(ErrorCode.NOT_FOUND);
      await this.audit.log(
        {
          actor: user,
          action: AuditAction.UPDATE,
          entity: 'student',
          entityId: studentId,
          before: { documentRemoved: { id: doc._id.toString(), fileName: doc.fileName } },
          after: null,
        },
        s,
      );
    });
    // Only after commit: a rolled-back removal must keep its file (ENOENT is ignored).
    await this.unlinkQuietly(this.resolve(doc.path));
  }
}
