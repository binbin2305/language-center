import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { setupApp } from '../../src/setup-app';
import { HealthController } from '../../src/health/health.controller';

describe('health', () => {
  let app: INestApplication;
  let mongod: MongoMemoryReplSet;

  beforeAll(async () => {
    mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    const moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(mongod.getUri())],
      controllers: [HealthController],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await mongod?.stop();
  });

  it('GET /api/v1/health → 200 {status:"ok", db:"up"}', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok', db: 'up' } });
  });
});
