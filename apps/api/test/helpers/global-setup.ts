import { MongoMemoryReplSet } from 'mongodb-memory-server';

declare global {
  var __MONGOD__: MongoMemoryReplSet | undefined;
}

export default async function globalSetup(): Promise<void> {
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  globalThis.__MONGOD__ = mongod;
  process.env.MONGO_TEST_URI = mongod.getUri();
}
