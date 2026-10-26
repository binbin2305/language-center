import { z } from 'zod';
import { PlacementStatus } from '../enums';
import { zDateTime, zDtoBase, zObjectId, zPagination, zScoreShape } from './common';

export const CreatePlacementTestInput = z.object({
  courseId: zObjectId,
  startAt: zDateTime,
  endAt: zDateTime,
  roomId: zObjectId,
  teacherId: zObjectId,
});
export type CreatePlacementTestInput = z.infer<typeof CreatePlacementTestInput>;

export const UpdatePlacementTestInput = CreatePlacementTestInput.omit({ courseId: true })
  .extend({ status: z.nativeEnum(PlacementStatus) })
  .partial()
  .strict();
export type UpdatePlacementTestInput = z.infer<typeof UpdatePlacementTestInput>;

export const ListPlacementTestsQuery = zPagination.extend({
  status: z.nativeEnum(PlacementStatus).optional(),
  courseId: zObjectId.optional(),
  teacherId: zObjectId.optional(),
  from: zDateTime.optional(),
  to: zDateTime.optional(),
});
export type ListPlacementTestsQuery = z.infer<typeof ListPlacementTestsQuery>;

/** POST /placement-tests/:id/candidates */
export const AddCandidatesInput = z.object({ enrollmentIds: z.array(zObjectId).min(1) });
export type AddCandidatesInput = z.infer<typeof AddCandidatesInput>;

export const PlacementResultItem = z.object({
  enrollmentId: zObjectId,
  score: zScoreShape,
  level: z.string().trim().min(1).max(50).nullable(),
  comment: z.string().trim().max(1000).optional(),
});
export type PlacementResultItem = z.infer<typeof PlacementResultItem>;

/** PUT /placement-tests/:id/results — body is the array itself. */
export const PutPlacementResultsInput = z.array(PlacementResultItem).min(1);
export type PutPlacementResultsInput = z.infer<typeof PutPlacementResultsInput>;

export const PlacementCandidateDto = z.object({
  enrollmentId: zObjectId,
  studentId: zObjectId,
  studentName: z.string().optional(),
  studentCode: z.string().optional(),
  score: zScoreShape,
  level: z.string().nullable(),
  comment: z.string().nullish(),
  gradedAt: zDateTime.nullable().optional(),
  gradedBy: zObjectId.nullable().optional(),
});
export type PlacementCandidateDto = z.infer<typeof PlacementCandidateDto>;

export const PlacementTestDto = z.object({
  ...zDtoBase,
  courseId: zObjectId,
  startAt: zDateTime,
  endAt: zDateTime,
  roomId: zObjectId,
  teacherId: zObjectId,
  status: z.nativeEnum(PlacementStatus),
  candidates: z.array(PlacementCandidateDto),
});
export type PlacementTestDto = z.infer<typeof PlacementTestDto>;
