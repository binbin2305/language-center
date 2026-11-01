import '../src/config/load-dotenv';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Connection, Model, Types } from 'mongoose';
import { AppModule } from '../src/app.module';
import { Models } from '../src/database/models';
import { Attendance } from '../src/database/schemas/attendance.schema';
import { Session } from '../src/database/schemas/session.schema';

/**
 * R12 backfill (W4 L-07, CR L-HARDENING-3): attendance records written before R12 have no `startAt`.
 * Sets it to the session's `startAt` (also repairs a stale copy), in batches of `batchSize` (default 1000):
 * one `sessions.find({_id:{$in}})` per batch, then a `bulkWrite` of `$set` with `timestamps: false`
 * (not a user edit, `updatedAt` unchanged). Rows already in step are not written, so a re-run reports
 * `updated: 0`. A record whose session no longer exists is left alone and counted in `orphans`.
 * Scans every attendance row (one-off; the check needs the session's value).
 * Usage: pnpm --filter api migrate:attendance-start-at
 */
type Row = Pick<Attendance, 'sessionId' | 'startAt'> & { _id: Types.ObjectId };

export async function runMigrateAttendanceStartAt(
  conn: Connection,
  opts: { batchSize?: number } = {},
): Promise<{ scanned: number; updated: number; orphans: number }> {
  const batchSize = opts.batchSize ?? 1000;
  const attendances = conn.models[Models.Attendance] as Model<Attendance>;
  const sessions = conn.models[Models.Session] as Model<Session>;
  let scanned = 0;
  let updated = 0;
  let orphans = 0;
  let batch: Row[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const ids = [...new Map(batch.map((r) => [String(r.sessionId), r.sessionId])).values()];
    const found = await sessions.find({ _id: { $in: ids } }, { startAt: 1 }).lean();
    const startOf = new Map(found.map((x) => [String(x._id), x.startAt]));
    const ops: AnyBulkWriteOperation<Attendance>[] = [];
    for (const r of batch) {
      const at = startOf.get(String(r.sessionId));
      if (!at) {
        orphans += 1;
        continue;
      }
      if (r.startAt && r.startAt.getTime() === at.getTime()) continue;
      ops.push({ updateOne: { filter: { _id: r._id }, update: { $set: { startAt: at } }, timestamps: false } });
    }
    if (ops.length > 0) updated += (await attendances.bulkWrite(ops, { ordered: false })).modifiedCount;
    batch = [];
  };

  const cursor = attendances.find({}, { sessionId: 1, startAt: 1 }).sort({ _id: 1 }).lean<Row[]>().cursor({ batchSize });
  for await (const row of cursor as AsyncIterable<Row>) {
    scanned += 1;
    batch.push(row);
    if (batch.length >= batchSize) await flush();
  }
  await flush();
  return { scanned, updated, orphans };
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const res = await runMigrateAttendanceStartAt(app.get<Connection>(getConnectionToken()));
    console.log(`attendance.startAt backfill: scanned ${res.scanned}, updated ${res.updated}, orphans ${res.orphans}.`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
