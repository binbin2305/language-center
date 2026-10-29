import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import {
  addVnDays,
  AuditAction,
  CancelLeadInput,
  CourseStatus,
  CreateLeadInput,
  ErrorCode,
  fromDateOnly,
  LeadDto,
  LeadStatus,
  ListLeadsQuery,
  removeVietnameseTones,
  startOfVnDay,
  UpdateLeadInput,
} from '@lc/shared';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth-user';
import { AppError } from '../../common/errors/app-error';
import { paginate } from '../../common/pagination';
import { Models } from '../../database/models';
import { Course } from '../../database/schemas/course.schema';
import { Lead } from '../../database/schemas/lead.schema';
import { LeadLean, toLeadDto } from './admissions.mapper';
import { DuplicatesService } from './duplicates.service';

const SORTS = new Set(['createdAt', '-createdAt', 'fullName', '-fullName']);

const TONE_VARIANTS: Record<string, string> = {
  a: 'àáạảãâầấậẩẫăằắặẳẵ',
  e: 'èéẹẻẽêềếệểễ',
  i: 'ìíịỉĩ',
  o: 'òóọỏõôồốộổỗơờớợởỡ',
  u: 'ùúụủũưừứựửữ',
  y: 'ỳýỵỷỹ',
  d: 'đ',
};

/** Accent-insensitive, regex-safe pattern: "dang" matches "Đặng". */
function toneInsensitivePattern(q: string): string {
  return [...removeVietnameseTones(q).toLowerCase()]
    .map((ch) => {
      const extra = TONE_VARIANTS[ch];
      if (!extra) return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return `[${ch}${ch.toUpperCase()}${extra}${extra.toUpperCase()}]`;
    })
    .join('');
}

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Models.Lead) private readonly leads: Model<Lead>,
    @InjectModel(Models.Course) private readonly courses: Model<Course>,
    private readonly duplicates: DuplicatesService,
    private readonly audit: AuditService,
  ) {}

  private async assertCourseUsable(courseId: string): Promise<void> {
    const course = await this.courses.findById(courseId).lean();
    if (!course || course.status !== CourseStatus.ACTIVE) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, undefined, {
        fields: { interestedCourseId: 'Khóa học không tồn tại hoặc đã ngừng' },
      });
    }
  }

  async create(user: AuthUser, input: CreateLeadInput, force: boolean): Promise<LeadDto> {
    await this.assertCourseUsable(input.interestedCourseId);
    if (!force) {
      const duplicates = await this.duplicates.find({ phone: input.phone, email: input.email });
      if (duplicates.length) throw new AppError(ErrorCode.DUPLICATE_PERSON, undefined, { duplicates });
    }
    const doc = await this.leads.create({
      ...input,
      dob: fromDateOnly(input.dob),
      email: input.email ?? null,
      interestedCourseId: new Types.ObjectId(input.interestedCourseId),
      status: LeadStatus.NEW,
      createdBy: user.id,
    });
    return toLeadDto(doc.toObject() as unknown as LeadLean);
  }

  async list(q: ListLeadsQuery) {
    const filter: FilterQuery<Lead> = { deletedAt: null };
    if (q.status) filter.status = q.status;
    if (q.courseId) filter.interestedCourseId = new Types.ObjectId(q.courseId);
    if (q.from || q.to) {
      filter.createdAt = {
        ...(q.from ? { $gte: startOfVnDay(q.from) } : {}),
        ...(q.to ? { $lt: startOfVnDay(addVnDays(q.to, 1)) } : {}),
      };
    }
    if (q.q) {
      const re = new RegExp(toneInsensitivePattern(q.q), 'i');
      const phone = q.q.replace(/[\s.-]/g, '');
      filter.$or = [{ fullName: re }, { email: re }, ...(phone ? [{ phone: { $regex: toneInsensitivePattern(phone) } }] : [])];
    }
    const page = await paginate(this.leads, filter, {
      page: q.page,
      limit: q.limit,
      sort: q.sort && SORTS.has(q.sort) ? q.sort : '-createdAt',
    });
    return { data: (page.data as unknown as LeadLean[]).map(toLeadDto), meta: page.meta };
  }

  private async findLean(id: string): Promise<LeadLean> {
    if (!isValidObjectId(id)) throw new AppError(ErrorCode.NOT_FOUND);
    const lead = await this.leads.findOne({ _id: id, deletedAt: null }).lean();
    if (!lead) throw new AppError(ErrorCode.NOT_FOUND);
    return lead as unknown as LeadLean;
  }

  async get(id: string): Promise<LeadDto> {
    return toLeadDto(await this.findLean(id));
  }

  async update(id: string, input: UpdateLeadInput): Promise<LeadDto> {
    await this.findLean(id);
    if (input.interestedCourseId) await this.assertCourseUsable(input.interestedCourseId);
    const { dob, interestedCourseId, ...rest } = input;
    const set: Record<string, unknown> = { ...rest };
    if (dob) set.dob = fromDateOnly(dob);
    if (interestedCourseId) set.interestedCourseId = new Types.ObjectId(interestedCourseId);
    if (input.email === null) set.email = null;
    const updated = await this.leads
      .findOneAndUpdate({ _id: id, deletedAt: null }, { $set: set }, { new: true, runValidators: true })
      .lean();
    if (!updated) throw new AppError(ErrorCode.NOT_FOUND);
    return toLeadDto(updated as unknown as LeadLean);
  }

  async cancel(user: AuthUser, id: string, input: CancelLeadInput): Promise<LeadDto> {
    await this.findLean(id);
    // Conditional update: only NEW → CANCELLED, so concurrent cancel/convert cannot both win.
    const updated = await this.leads
      .findOneAndUpdate(
        { _id: id, deletedAt: null, status: LeadStatus.NEW },
        { $set: { status: LeadStatus.CANCELLED } },
        { new: true },
      )
      .lean();
    if (!updated) throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
    await this.audit.log({
      actor: user,
      action: AuditAction.STATUS,
      entity: Models.Lead,
      entityId: updated._id,
      before: { status: LeadStatus.NEW },
      after: { status: LeadStatus.CANCELLED, reason: input.reason },
    });
    return toLeadDto(updated as unknown as LeadLean);
  }
}
