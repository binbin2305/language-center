import { z } from 'zod';
import { AssessmentType, GradeClass } from '../enums';
import { zDateOnly, zDateTime, zDtoBase, zObjectId, zPagination, zReason, zScoreShape } from './common';

/** POST /classes/:id/assessments. weight range 0-100 and class total <= 100 are service rules. */
export const CreateAssessmentInput = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.nativeEnum(AssessmentType),
  weight: z.number(),
  heldOn: zDateOnly,
});
export type CreateAssessmentInput = z.infer<typeof CreateAssessmentInput>;

export const UpdateAssessmentInput = CreateAssessmentInput.partial().strict();
export type UpdateAssessmentInput = z.infer<typeof UpdateAssessmentInput>;

const gradeComment = z.string().trim().max(1000);

/** PUT /assessments/:id/grades. Score scale is a service rule (SCORE_OUT_OF_RANGE). */
export const UpsertGradesInput = z.object({
  grades: z
    .array(z.object({ studentId: zObjectId, score: zScoreShape, comment: gradeComment.optional() }))
    .min(1),
  confirm: z.boolean().default(false),
});
export type UpsertGradesInput = z.infer<typeof UpsertGradesInput>;

/** PATCH /assessments/:id/grades/:studentId (after confirm; reason required by service). */
export const AmendGradeInput = z.object({
  score: zScoreShape,
  comment: gradeComment.optional(),
  reason: zReason,
});
export type AmendGradeInput = z.infer<typeof AmendGradeInput>;

/** POST /assessments/:id/unlock */
export const UnlockAssessmentInput = z.object({ until: zDateTime });
export type UnlockAssessmentInput = z.infer<typeof UnlockAssessmentInput>;

/** GET /results */
export const ListResultsQuery = zPagination.extend({
  courseId: zObjectId.optional(),
  classId: zObjectId.optional(),
  studentId: zObjectId.optional(),
});
export type ListResultsQuery = z.infer<typeof ListResultsQuery>;

/** GET /results/transcript.pdf?studentId&classId */
export const TranscriptQuery = z.object({ studentId: zObjectId, classId: zObjectId });
export type TranscriptQuery = z.infer<typeof TranscriptQuery>;

export const AssessmentDto = z.object({
  ...zDtoBase,
  classId: zObjectId,
  name: z.string(),
  type: z.nativeEnum(AssessmentType),
  weight: z.number(),
  heldOn: zDateOnly,
  confirmedAt: zDateTime.nullable(),
  unlockedUntil: zDateTime.nullable(),
  /** Derived: heldOn + settings.gradeLockDays */
  lockedAt: zDateTime,
  /** Derived: now > lockedAt && !(unlockedUntil > now) */
  isLocked: z.boolean(),
  createdBy: zObjectId.optional(),
});
export type AssessmentDto = z.infer<typeof AssessmentDto>;

export const GradeHistoryEntry = z.object({
  fromScore: zScoreShape,
  toScore: zScoreShape,
  fromComment: z.string().nullish(),
  toComment: z.string().nullish(),
  reason: z.string(),
  by: zObjectId,
  at: zDateTime,
});
export type GradeHistoryEntry = z.infer<typeof GradeHistoryEntry>;

export const GradeDto = z.object({
  ...zDtoBase,
  assessmentId: zObjectId,
  classId: zObjectId,
  studentId: zObjectId,
  enrollmentId: zObjectId,
  score: zScoreShape,
  comment: z.string().nullish(),
  isDraft: z.boolean(),
  history: z.array(GradeHistoryEntry),
  studentName: z.string().optional(),
  studentCode: z.string().optional(),
});
export type GradeDto = z.infer<typeof GradeDto>;

/** GET /results row: per-assessment scores + weighted average + classification. */
export const ResultDto = z.object({
  studentId: zObjectId,
  studentName: z.string().optional(),
  classId: zObjectId,
  classCode: z.string().optional(),
  className: z.string().optional(),
  courseId: zObjectId,
  items: z.array(
    z.object({
      assessmentId: zObjectId,
      name: z.string(),
      type: z.nativeEnum(AssessmentType),
      weight: z.number(),
      score: zScoreShape,
    }),
  ),
  average: z.number().nullable(),
  gradeClass: z.nativeEnum(GradeClass).nullable(),
  passed: z.boolean().nullable(),
});
export type ResultDto = z.infer<typeof ResultDto>;


/** GET /assessments/:id/grades — roster rows incl. students who left the class (left: true, D14). */
export const AssessmentGradesDto = z.object({
  assessment: AssessmentDto,
  rows: z.array(
    z.object({
      studentId: zObjectId,
      enrollmentId: zObjectId,
      studentCode: z.string(),
      studentName: z.string(),
      score: zScoreShape,
      comment: z.string().nullish(),
      isDraft: z.boolean(),
      left: z.boolean(),
      history: z.array(GradeHistoryEntry),
    }),
  ),
});
export type AssessmentGradesDto = z.infer<typeof AssessmentGradesDto>;
