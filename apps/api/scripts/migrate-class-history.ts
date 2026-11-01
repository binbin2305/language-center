import '../src/config/load-dotenv';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { AnyBulkWriteOperation, Connection, Model, Types } from 'mongoose';
import { EnrollmentStatus } from '@lc/shared';
import { AppModule } from '../src/app.module';
import { Models } from '../src/database/models';
import { Enrollment } from '../src/database/schemas/enrollment.schema';

/**
 * R22 backfill (W2 hardening, D38): legacy enrollments predate `classHistory`. Adds to it every class
 * the row was seated in: `classId` plus the `classId` of history entries `to: ENROLLED | TRANSFERRED`.
 * `$addToSet` in batches of 1000 with `timestamps: false` (not a user edit, `updatedAt` unchanged);
 * rows already complete are not written, so a re-run reports `updated: 0`.
 * Usage: pnpm --filter api migrate:class-history
 */
const BATCH = 1000;
const SEATED: string[] = [EnrollmentStatus.ENROLLED, EnrollmentStatus.TRANSFERRED];

type Row = Pick<Enrollment, 'classId' | 'classHistory' | 'history'> & { _id: Types.ObjectId };

export async function runMigrateClassHistory(conn: Connection): Promise<{ scanned: number; updated: number }> {
  const model = conn.models[Models.Enrollment] as Model<Enrollment>;
  let scanned = 0;
  let updated = 0;
  let ops: AnyBulkWriteOperation<Enrollment>[] = [];
  const flush = async () => {
    if (ops.length === 0) return;
    const res = await model.bulkWrite(ops, { ordered: false });
    updated += res.modifiedCount;
    ops = [];
  };

  const cursor = model
    .find({ $or: [{ classId: { $ne: null } }, { 'history.classId': { $exists: true } }] }, { classId: 1, classHistory: 1, history: 1 })
    .lean<Row[]>()
    .cursor({ batchSize: BATCH });
  for await (const row of cursor as AsyncIterable<Row>) {
    scanned += 1;
    const seated = [row.classId, ...(row.history ?? []).filter((h) => SEATED.includes(h.to)).map((h) => h.classId)];
    const have = new Set((row.classHistory ?? []).map(String));
    const missing = new Map<string, Types.ObjectId>();
    for (const cid of seated) if (cid && !have.has(String(cid))) missing.set(String(cid), cid);
    if (missing.size === 0) continue;
    ops.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $addToSet: { classHistory: { $each: [...missing.values()] } } },
        timestamps: false,
      },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();
  return { scanned, updated };
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const res = await runMigrateClassHistory(app.get<Connection>(getConnectionToken()));
    console.log(`classHistory backfill: scanned ${res.scanned}, updated ${res.updated}.`);
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
