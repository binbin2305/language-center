import { Types } from 'mongoose';
import { PlacementTestDto } from '@lc/shared';
import type { PlacementTest } from '../../database/schemas/placement-test.schema';

export type PlacementLean = PlacementTest & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export interface PlacementLabels {
  courseName?: string;
  roomCode?: string;
  teacherName?: string;
  students?: Map<string, { fullName: string; code: string }>;
}

const oid = (v: Types.ObjectId | null | undefined) => (v ? v.toString() : null);

export function toPlacementDto(p: PlacementLean, labels: PlacementLabels = {}): PlacementTestDto {
  return {
    id: p._id.toString(),
    courseId: p.courseId.toString(),
    startAt: p.startAt.toISOString(),
    endAt: p.endAt.toISOString(),
    roomId: p.roomId.toString(),
    teacherId: p.teacherId.toString(),
    status: p.status,
    candidates: p.candidates.map((c) => {
      const st = labels.students?.get(c.studentId.toString());
      return {
        enrollmentId: c.enrollmentId.toString(),
        studentId: c.studentId.toString(),
        ...(st ? { studentName: st.fullName, studentCode: st.code } : {}),
        score: c.score ?? null,
        level: c.level ?? null,
        comment: c.comment ?? null,
        gradedAt: c.gradedAt ? c.gradedAt.toISOString() : null,
        gradedBy: oid(c.gradedBy),
      };
    }),
    ...(labels.courseName !== undefined ? { courseName: labels.courseName } : {}),
    ...(labels.roomCode !== undefined ? { roomCode: labels.roomCode } : {}),
    ...(labels.teacherName !== undefined ? { teacherName: labels.teacherName } : {}),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
