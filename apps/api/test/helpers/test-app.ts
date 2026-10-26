import { INestApplication, Module, Type } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ClockService } from '../../src/common/clock/clock.service';
import { setupApp } from '../../src/setup-app';
import { FakeClock } from './fake-clock';

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request.agent>;
  clock: FakeClock;
  conn: Connection;
  close(): Promise<void>;
}

export interface CreateTestAppOptions {
  overrides?: Array<{ provide: unknown; useValue: unknown }>;
  /** Test-only controllers added next to the real AppModule. */
  controllers?: Type<unknown>[];
}

export const DEFAULT_NOW = new Date('2026-01-05T02:00:00Z');

function dbUri(): string {
  const base = process.env.MONGO_TEST_URI;
  if (!base) throw new Error('MONGO_TEST_URI is not set; run via jest-e2e.config.ts (globalSetup)');
  const name = `lc_test_${randomBytes(6).toString('hex')}`;
  // base looks like mongodb://host:port/?replicaSet=rs0
  return base.replace('/?', `/${name}?`);
}

export async function createTestApp(opts: CreateTestAppOptions = {}): Promise<TestApp> {
  process.env.MONGODB_URI = dbUri();
  const clock = new FakeClock(DEFAULT_NOW);

  @Module({ controllers: opts.controllers ?? [] })
  class ExtraModule {}

  let builder = Test.createTestingModule({ imports: [AppModule, ExtraModule] })
    .overrideProvider(ClockService)
    .useValue(clock);
  for (const o of opts.overrides ?? []) builder = builder.overrideProvider(o.provide).useValue(o.useValue);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();

  const conn = app.get<Connection>(getConnectionToken());
  for (const model of Object.values(conn.models)) await model.syncIndexes();

  return {
    app,
    clock,
    conn,
    http: () => request.agent(app.getHttpServer()),
    async close() {
      await conn.dropDatabase();
      await app.close();
    },
  };
}
