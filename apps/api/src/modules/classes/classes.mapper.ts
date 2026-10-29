import { Types } from 'mongoose';
import { ClassDto, toDateOnly } from '@lc/shared';
import type { Class } from '../../database/schemas/class.schema';

export type ClassLean = Class & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function toDto(
  c: ClassLean,
  names: { courseName?: string; teacherName?: string; defaultRoomName?: string } = {},
): ClassDto {
  return {
    id: c._id.toString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    code: c.code,
    name: c.name,
    courseId: c.courseId.toString(),
    level: c.level,
    teacherId: c.teacherId.toString(),
    assistantTeacherId: c.assistantTeacherId?.toString() ?? null,
    defaultRoomId: c.defaultRoomId?.toString() ?? null,
    maxCapacity: c.maxCapacity,
    currentSize: c.currentSize,
    startDate: toDateOnly(c.startDate),
    endDate: toDateOnly(c.endDate),
    status: c.status,
    ...names,
  };
}
