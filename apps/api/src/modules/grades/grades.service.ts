import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  AuditAction,
  ErrorCode,
  Role,
  fromDateOnly,
  type AssessmentDto,
  type CreateAssessmentInput,
  type UpdateAssessmentInput,
} from '@lc/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { AuditService } from '../../common/audit/audit.service';
import { ClockService } from '../../common/clock/clock.service';
import { CounterService } from '../../common/db/counter.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { ScopeService } from '../../common/scope/scope.service';
import { SettingsService } from '../../common/settings/settings.service';
import { Models } from '../../database/models';
import type { Assessment, AssessmentDoc } from '../../database/schemas/assessment.schema';
import type { Class } from '../../database/schemas/class.schema';
import type { Grade } from '../../database/schemas/grade.schema';
import { toAssessmentDto } from './grades.mapper';

const fieldError = (field: string, message: string) =>
  new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { [field]: message } });

function assertWeight(weight: number): void {
  if (!(weight > 0 && weight <= 100)) throw fieldError('weight', 'MUST_BE_GREATER_THAN_0_AND_AT_MOST_100');
}

@Injectable()
export class GradesService {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Models.Assessment) private readonly assessments: Model<Assessment>,
    @InjectModel(Models.Grade) private readonly grades: Model<Grade>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    private readonly audit: AuditService,
    private readonly counters: CounterService,
    private readonly clock: ClockService,
    private readonly scope: ScopeService,
    private readonly settings: SettingsService,
  ) {}

  /** M/S see every class; T needs main/assistant role; STUDENT needs any enrollment with a class; others 404. */
  private async assertClassScope(classId: Types.ObjectId, user: AuthUser, write: boolean): Promise<void> {
    if (user.role === Role.TEACHER) {
      const mine = await this.scope.teacherClassIds(user.id);
      if (!mine.some((x) => x.equals(classId))) throw new AppError(ErrorCode.NOT_FOUND);
    } else if (user.role === Role.STUDENT && !write) {
      const mine = user.studentId ? await this.scope.studentClassIds(user.studentId, 'history') : [];
      if (!mine.some((x) => x.equals(classId))) throw new AppError(ErrorCode.NOT_FOUND);
    }
  }

  private async loadClass(id: string, s?: ClientSession): Promise<Types.ObjectId> {
    const c = await this.classes.findById(id, { _id: 1 }, { session: s }).lean();
    if (!c) throw new AppError(ErrorCode.NOT_FOUND);
    return c._id;
  }

  private async loadAssessment(id: string, s?: ClientSession): Promise<AssessmentDoc> {
    const a = await this.assessments.findById(id, null, { session: s });
    if (!a) throw new AppError(ErrorCode.NOT_FOUND);
    return a;
  }

  /** Serialises writers of one class's weights, then checks the class total stays <= 100. */
  private async assertWeightFits(classId: Types.ObjectId, weight: number, excludeId: Types.ObjectId | null, s: ClientSession) {
    await this.counters.next(`lock:class:${classId}`, s);
    const others = await this.assessments.find(excludeId ? { classId, _id: { $ne: excludeId } } : { classId }, { weight: 1 }, { session: s }).lean();
    const total = others.reduce((sum, o) => sum + o.weight, 0);
    if (total + weight > 100) throw new AppError(ErrorCode.WEIGHT_EXCEEDS_100, undefined, { currentTotal: total });
  }

  async list(classId: string, user: AuthUser): Promise<AssessmentDto[]> {
    const cid = await this.loadClass(classId);
    await this.assertClassScope(cid, user, false);
    const [docs, settings] = await Promise.all([this.assessments.find({ classId: cid }).sort({ heldOn: 1, _id: 1 }), this.settings.get()]);
    const now = this.clock.now();
    return docs.map((d) => toAssessmentDto(d, settings, now));
  }

  async create(classId: string, input: CreateAssessmentInput, actor: AuthUser): Promise<AssessmentDto> {
    const cid = await this.loadClass(classId);
    await this.assertClassScope(cid, actor, true);
    assertWeight(input.weight);
    const doc = await withTransaction(this.conn, async (s) => {
      await this.assertWeightFits(cid, input.weight, null, s);
      const [created] = await this.assessments.create(
        [{ classId: cid, name: input.name, type: input.type, weight: input.weight, heldOn: fromDateOnly(input.heldOn), createdBy: actor.id }],
        { session: s },
      );
      await this.audit.log({ actor, action: AuditAction.CREATE, entity: Models.Assessment, entityId: created._id, after: created.toObject() }, s);
      return created;
    });
    return toAssessmentDto(doc, await this.settings.get(), this.clock.now());
  }

  async update(id: string, input: UpdateAssessmentInput, actor: AuthUser): Promise<AssessmentDto> {
    const current = await this.loadAssessment(id);
    await this.assertClassScope(current.classId, actor, true);
    if (input.weight !== undefined) assertWeight(input.weight);
    const doc = await withTransaction(this.conn, async (s) => {
      // Lock first, then re-read inside the transaction so a concurrent delete/patch is seen.
      await this.counters.next(`lock:class:${current.classId}`, s);
      const a = await this.loadAssessment(id, s);
      const before = a.toObject();
      if (input.weight !== undefined) await this.assertWeightFits(a.classId, input.weight, a._id, s);
      if (input.name !== undefined) a.name = input.name;
      if (input.type !== undefined) a.type = input.type;
      if (input.weight !== undefined) a.weight = input.weight;
      if (input.heldOn !== undefined) a.heldOn = fromDateOnly(input.heldOn);
      await a.save({ session: s });
      await this.audit.log({ actor, action: AuditAction.UPDATE, entity: Models.Assessment, entityId: a._id, before, after: a.toObject() }, s);
      return a;
    });
    return toAssessmentDto(doc, await this.settings.get(), this.clock.now());
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const current = await this.loadAssessment(id);
    await this.assertClassScope(current.classId, actor, true);
    await withTransaction(this.conn, async (s) => {
      await this.counters.next(`lock:class:${current.classId}`, s);
      const a = await this.loadAssessment(id, s);
      if (await this.grades.exists({ assessmentId: a._id }).session(s)) throw new AppError(ErrorCode.ASSESSMENT_HAS_GRADES);
      await a.deleteOne({ session: s });
      await this.audit.log({ actor, action: AuditAction.DELETE, entity: Models.Assessment, entityId: a._id, before: a.toObject() }, s);
    });
  }
}
