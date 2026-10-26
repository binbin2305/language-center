import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Persistent single-node replica set for local dev without Docker. Data lives in `.mongo-data/` at the repo root. */
async function main(): Promise<void> {
  const dbPath = resolve(__dirname, '../../../.mongo-data');
  mkdirSync(dbPath, { recursive: true });
  const rs = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', dbName: 'language-center' },
    instanceOpts: [{ port: Number(process.env.MONGO_DEV_PORT ?? 27017), dbPath, storageEngine: 'wiredTiger' }],
  });
  const uri = rs.getUri('language-center');
  console.log(`MongoDB ready. Set in apps/api/.env:\nMONGODB_URI=${uri}`);
  const stop = async (): Promise<void> => {
    await rs.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

void main();
