import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  AuditAction,
  ErrorCode,
  EnrollmentStatus,
  NotificationRefType,
  NotificationType,
  Role,
  fromDateOnly,
  isValidScore,
  type AssessmentDto,
  type AssessmentGradesDto,
  type UpsertGradesInput,
  type CreateAssessmentInput,
  type UpdateAssessmentInput,
} from '@lc/shared';
import type { AuthUser } from '../../common/auth/auth-user';
import { AuditService } from '../../common/audit/audit.service';
import { ClockService } from '../../common/clock/clock.service';
import { CounterService } from '../../common/db/counter.service';
import { withTransaction } from '../../common/db/transaction';
import { AppError } from '../../common/errors/app-error';
import { NotificationsService } from '../../common/notifications/notifications.service';
import { ScopeService } from '../../common/scope/scope.service';
import { SettingsService } from '../../common/settings/settings.service';
import { Models } from '../../database/models';
import type { Assessment, AssessmentDoc } from '../../database/schemas/assessment.schema';
import type { Class } from '../../database/schemas/class.schema';
import type { Enrollment } from '../../database/schemas/enrollment.schema';
import type { Grade } from '../../database/schemas/grade.schema';
import type { Student } from '../../database/schemas/student.schema';
import { toAssessmentDto } from './grades.mapper';

const fieldError = (field: string, message: string) =>
  new AppError(ErrorCode.VALIDATION_FAILED, undefined, { fields: { [field]: message } });

function assertWeight(weight: number): void {
  if (!(weight > 0 && weight <= 100)) throw fieldError('weight', 'MUST_BE_GREATER_THAN_0_AND_AT_MOST_100');
}

@Injectable()
export class GradesService {
  private readonly logger = new Logger(GradesService.name);

  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(Models.Assessment) private readonly assessments: Model<Assessment>,
    @InjectModel(Models.Grade) private readonly grades: Model<Grade>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
    @InjectModel(Models.Enrollment) private readonly enrollments: Model<Enrollment>,
    @InjectModel(Models.Student) private readonly students: Model<Student>,
    private readonly notifications: NotificationsService,
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

  /** Roster (D14) = ENROLLED|COMPLETED of the class, plus graded students who left (left: true). */
  private async buildGrades(a: AssessmentDoc, s?: ClientSession): Promise<AssessmentGradesDto> {
    const settings = await this.settings.get();
    const roster = await this.enrollments
      .find({ classId: a.classId, status: { $in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED] } }, null, { session: s })
      .lean();
    const grades = await this.grades.find({ assessmentId: a._id }, null, { session: s }).lean();
    const byStudent = new Map(grades.map((g) => [String(g.studentId), g]));
    const rosterIds = new Set(roster.map((e) => String(e.studentId)));
    const students = await this.students
      .find({ _id: { $in: [...roster.map((e) => e.studentId), ...grades.map((g) => g.studentId)] } }, { code: 1, fullName: 1 }, { session: s })
      .lean();
    const info = new Map(students.map((x) => [String(x._id), x]));
    const rows = [
      ...roster.map((e) => ({ studentId: e.studentId, enrollmentId: e._id, left: false })),
      ...grades.filter((g) => !rosterIds.has(String(g.studentId))).map((g) => ({ studentId: g.studentId, enrollmentId: g.enrollmentId, left: true })),
    ].map((r) => {
      const g = byStudent.get(String(r.studentId));
      const st = info.get(String(r.studentId));
      return {
        studentId: r.studentId.toString(),
        enrollmentId: r.enrollmentId.toString(),
        studentCode: st?.code ?? '',
        studentName: st?.fullName ?? '',
        score: g?.score ?? null,
        comment: g?.comment ?? null,
        isDraft: g?.isDraft ?? true,
        left: r.left,
        history: (g?.history ?? []).map((h) => ({
          fromScore: h.fromScore,
          toScore: h.toScore,
          fromComment: h.fromComment ?? null,
          toComment: h.toComment ?? null,
          reason: h.reason,
          by: h.by.toString(),
          at: h.at.toISOString(),
        })),
      };
    });
    rows.sort((x, y) => x.studentCode.localeCompare(y.studentCode));
    return { assessment: toAssessmentDto(a, settings, this.clock.now()), rows };
  }

  async getGrades(id: string, user: AuthUser): Promise<AssessmentGradesDto> {
    const a = await this.loadAssessment(id);
    await this.assertClassScope(a.classId, user, false);
    return this.buildGrades(a);
  }

  async upsertGrades(id: string, input: UpsertGradesInput, actor: AuthUser): Promise<AssessmentGradesDto> {
    const current = await this.loadAssessment(id);
    await this.assertClassScope(current.classId, actor, true);
    if (new Set(input.grades.map((g) => g.studentId)).size !== input.grades.length) {
      throw fieldError('grades', 'DUPLICATE_STUDENT');
    }
    const settings = await this.settings.get();
    const now = this.clock.now();
    const rosterUserIds: Types.ObjectId[] = [];
    const result = await withTransaction(this.conn, async (s) => {
      rosterUserIds.length = 0;
      await this.counters.next(`lock:class:${current.classId}`, s);
      const a = await this.loadAssessment(id, s);
      if (toAssessmentDto(a, settings, now).isLocked) throw new AppError(ErrorCode.GRADEBOOK_LOCKED);

      const entries = new Map(input.grades.map((g) => [g.studentId, g]));
      const bad = [...entries.values()].filter((g) => g.score !== null && !isValidScore(g.score)).map((g) => g.studentId);
      if (bad.length) throw new AppError(ErrorCode.SCORE_OUT_OF_RANGE, undefined, { studentIds: bad });

      const roster = await this.enrollments
        .find({ classId: a.classId, status: { $in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED] } }, null, { session: s })
        .lean();
      const byStudent = new Map(roster.map((e) => [String(e.studentId), e]));
      const outside = [...entries.keys()].filter((k) => !byStudent.has(k));
      if (outside.length) throw new AppError(ErrorCode.STUDENT_NOT_IN_ROSTER, undefined, { studentIds: outside });

      const existing = await this.grades.find({ assessmentId: a._id }, null, { session: s }).lean();
      const existingBy = new Map(existing.map((g) => [String(g.studentId), g]));
      if (a.confirmedAt && [...entries.keys()].some((k) => existingBy.has(k))) {
        throw new AppError(ErrorCode.INVALID_STATUS_TRANSITION);
      }
      if (input.confirm) {
        const missing = roster
          .map((e) => String(e.studentId))
          .filter((k) => (entries.has(k) ? entries.get(k)!.score : existingBy.get(k)?.score ?? null) === null);
        if (missing.length) throw new AppError(ErrorCode.GRADES_INCOMPLETE, undefined, { studentIds: missing });
      }

      const confirmed = input.confirm || !!a.confirmedAt;
      for (const [studentId, g] of entries) {
        const e = byStudent.get(studentId)!;
        await this.grades.updateOne(
          { assessmentId: a._id, studentId: e.studentId },
          {
            $set: { classId: a.classId, enrollmentId: e._id, score: g.score, isDraft: !confirmed, ...(g.comment !== undefined ? { comment: g.comment } : {}) },
            $setOnInsert: { history: [] },
          },
          { upsert: true, session: s },
        );
      }
      if (input.confirm && !a.confirmedAt) {
        await this.grades.updateMany({ assessmentId: a._id }, { $set: { isDraft: false } }, { session: s });
        a.confirmedAt = now;
        await a.save({ session: s });
        const sts = await this.students.find({ _id: { $in: roster.map((e) => e.studentId) } }, { userId: 1 }, { session: s }).lean();
        rosterUserIds.push(...sts.flatMap((x) => (x.userId ? [x.userId] : [])));
      }
      await this.audit.log(
        { actor, action: AuditAction.UPDATE, entity: Models.Grade, entityId: a._id, after: { entries: entries.size, confirm: input.confirm } },
        s,
      );
      return this.buildGrades(a, s);
    });
    if (rosterUserIds.length) {
      try {
        await this.notifications.notify(rosterUserIds, {
          type: NotificationType.GRADES_PUBLISHED,
          title: 'Điểm mới được công bố',
          body: `Điểm bài "${current.name}" đã được công bố.`,
          refType: NotificationRefType.ASSESSMENT,
          refId: current._id,
        });
      } catch (err) {
        this.logger.error(`GRADES_PUBLISHED notify failed for assessment ${current._id}`, err instanceof Error ? err.stack : String(err));
      }
    }
    return result;
  }
}
