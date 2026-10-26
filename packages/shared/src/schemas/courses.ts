import { z } from 'zod';
import { CourseStatus } from '../enums';
import { zDtoBase, zMoney, zPagination } from './common';

export const CreateCourseInput = z.object({
  code: z.string().trim().min(1).max(30).toUpperCase(),
  name: z.string().trim().min(1).max(150),
  language: z.string().trim().min(1).max(50),
  levels: z.array(z.string().trim().min(1).max(50)).min(1),
  description: z.string().trim().max(2000).optional(),
  totalSessions: z.number().int().positive(),
  baseFee: zMoney,
  status: z.nativeEnum(CourseStatus).optional(),
});
export type CreateCourseInput = z.infer<typeof CreateCourseInput>;

/** PATCH /courses/:id — code is immutable. */
export const UpdateCourseInput = CreateCourseInput.omit({ code: true }).partial().strict();
export type UpdateCourseInput = z.infer<typeof UpdateCourseInput>;

export const ListCoursesQuery = zPagination.extend({
  status: z.nativeEnum(CourseStatus).optional(),
  language: z.string().trim().optional(),
  q: z.string().trim().max(100).optional(),
});
export type ListCoursesQuery = z.infer<typeof ListCoursesQuery>;

export const CourseDto = z.object({
  ...zDtoBase,
  code: z.string(),
  name: z.string(),
  language: z.string(),
  levels: z.array(z.string()),
  description: z.string().nullish(),
  totalSessions: z.number().int(),
  baseFee: zMoney,
  status: z.nativeEnum(CourseStatus),
});
export type CourseDto = z.infer<typeof CourseDto>;
