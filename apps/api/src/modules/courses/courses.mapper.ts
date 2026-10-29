import { Types } from 'mongoose';
import type { CourseDto } from '@lc/shared';
import type { Course } from '../../database/schemas/course.schema';

export type CourseLean = Course & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function toCourseDto(c: CourseLean): CourseDto {
  return {
    id: c._id.toString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    code: c.code,
    name: c.name,
    language: c.language,
    levels: c.levels,
    description: c.description ?? null,
    totalSessions: c.totalSessions,
    baseFee: c.baseFee,
    status: c.status,
  };
}
