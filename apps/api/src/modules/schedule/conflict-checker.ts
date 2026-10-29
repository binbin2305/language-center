import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { ClientSession, Model } from 'mongoose';
import { PlacementStatus, SessionStatus, type SessionConflictDto } from '@lc/shared';
import type { ScheduleConflictChecker, ScheduleConflictQuery } from '../../common/contracts/schedule-conflict-checker';
import { Models } from '../../database/models';
import type { Class } from '../../database/schemas/class.schema';
import type { PlacementTest } from '../../database/schemas/placement-test.schema';
import type { Session } from '../../database/schemas/session.schema';

export interface Slot {
  id?: string;
  roomId: string;
  teacherId: string;
  startAt: Date;
  endAt: Date;
}

type Range = { startAt: Date; endAt: Date };

/** Half-open interval overlap: back-to-back slots (19:30 end / 19:30 start) do not conflict. */
export function overlaps(a: Range, b: Range): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

/** One entry per kind: a record sharing both room and teacher yields ROOM and TEACHER. */
export function findSlotConflicts(candidate: Slot, existing: Slot[]): Array<{ slot: Slot; kind: 'ROOM' | 'TEACHER' }> {
  const out: Array<{ slot: Slot; kind: 'ROOM' | 'TEACHER' }> = [];
  for (const slot of existing) {
    if (candidate.id !== undefined && slot.id === candidate.id) continue;
    if (!overlaps(candidate, slot)) continue;
    if (slot.roomId === candidate.roomId) out.push({ slot, kind: 'ROOM' });
    if (slot.teacherId === candidate.teacherId) out.push({ slot, kind: 'TEACHER' });
  }
  return out;
}

@Injectable()
export class MongoScheduleConflictChecker implements ScheduleConflictChecker {
  constructor(
    @InjectModel(Models.Session) private readonly sessions: Model<Session>,
    @InjectModel(Models.PlacementTest) private readonly placementTests: Model<PlacementTest>,
    @InjectModel(Models.Class) private readonly classes: Model<Class>,
  ) {}

  async findConflicts(q: ScheduleConflictQuery, s?: ClientSession): Promise<SessionConflictDto[]> {
    const window = {
      startAt: { $lt: q.endAt },
      endAt: { $gt: q.startAt },
      $or: [{ roomId: q.roomId }, { teacherId: q.teacherId }],
    };
    const findSessions = () =>
      this.sessions
        .find({
          ...window,
          status: SessionStatus.SCHEDULED,
          ...(q.excludeSessionId ? { _id: { $ne: q.excludeSessionId } } : {}),
        })
        .session(s ?? null)
        .lean();
    const findTests = () =>
      this.placementTests
        .find({
          ...window,
          status: PlacementStatus.SCHEDULED,
          ...(q.excludePlacementTestId ? { _id: { $ne: q.excludePlacementTestId } } : {}),
        })
        .session(s ?? null)
        .lean();
    // A ClientSession must not run concurrent operations, so reads inside a transaction go one by one.
    const [sessions, tests] = s ? [await findSessions(), await findTests()] : await Promise.all([findSessions(), findTests()]);

    const classIds = [...new Set(sessions.map((x) => String(x.classId)))];
    const classRows = classIds.length
      ? await this.classes.find({ _id: { $in: classIds } }, { code: 1 }).session(s ?? null).lean()
      : [];
    const codeById = new Map(classRows.map((c) => [String(c._id), c.code]));

    const candidate: Slot = {
      roomId: String(q.roomId),
      teacherId: String(q.teacherId),
      startAt: q.startAt,
      endAt: q.endAt,
    };
    const toSlot = (d: { _id: unknown; roomId: unknown; teacherId: unknown; startAt: Date; endAt: Date }): Slot => ({
      id: String(d._id),
      roomId: String(d.roomId),
      teacherId: String(d.teacherId),
      startAt: d.startAt,
      endAt: d.endAt,
    });

    const result: SessionConflictDto[] = [];
    for (const doc of sessions) {
      for (const { kind } of findSlotConflicts(candidate, [toSlot(doc)])) {
        result.push({
          sessionId: String(doc._id),
          kind,
          classId: String(doc.classId),
          ...(codeById.has(String(doc.classId)) ? { classCode: codeById.get(String(doc.classId)) } : {}),
          startAt: doc.startAt.toISOString(),
          endAt: doc.endAt.toISOString(),
          roomId: String(doc.roomId),
          teacherId: String(doc.teacherId),
        });
      }
    }
    for (const doc of tests) {
      for (const { kind } of findSlotConflicts(candidate, [toSlot(doc)])) {
        result.push({
          placementTestId: String(doc._id),
          kind,
          startAt: doc.startAt.toISOString(),
          endAt: doc.endAt.toISOString(),
          roomId: String(doc.roomId),
          teacherId: String(doc.teacherId),
        });
      }
    }
    return result.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
}
