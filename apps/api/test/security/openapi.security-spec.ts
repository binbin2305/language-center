import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { listRoutes, RouteInfo } from '../../src/common/routes/route-inventory';
import { setupApp } from '../../src/setup-app';
import { createTestApp, TestApp } from '../helpers/test-app';

type Op = {
  security?: unknown;
  'x-roles'?: unknown;
  parameters?: Array<{ name: string; in: string }>;
  requestBody: { content: Record<string, { schema: { properties: Record<string, unknown> } }> };
};
type Doc = { openapi: string; paths: Record<string, Record<string, Op>> };

const toOpenApiPath = (p: string) => '/api/v1' + p.replace(/:(\w+)/g, '{$1}');

describe('H-04 OpenAPI', () => {
  let t: TestApp;
  let routes: RouteInfo[];
  let doc: Doc;

  beforeAll(async () => {
    t = await createTestApp();
    routes = listRoutes(t.app);
    const res = await request(t.app.getHttpServer()).get('/api/docs-json');
    doc = res.body as Doc;
  });
  afterAll(async () => {
    await t.close();
  });

  it('NFR-01 GET /api/docs-json 200 không cần token, openapi "3.0.x"', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\.0\./);
  });

  it('mọi route của listRoutes có paths["/api/v1"+path][method]', () => {
    const missing = routes
      .filter((r) => !doc.paths?.[toOpenApiPath(r.path)]?.[r.method.toLowerCase()])
      .map((r) => `${r.method} ${r.path}`);
    expect(missing).toEqual([]);
  });

  it('POST /api/v1/auth/login requestBody có properties username, password', () => {
    const schema =
      doc.paths['/api/v1/auth/login'].post.requestBody.content['application/json'].schema;
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(['username', 'password']),
    );
  });

  it('GET /api/v1/students có parameters q, page, limit từ ListStudentsQuery', () => {
    const params = doc.paths['/api/v1/students'].get.parameters ?? [];
    const names = params.filter((p) => p.in === 'query').map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['q', 'page', 'limit']));
  });

  it('GET /api/v1/students/{id} có path parameter id', () => {
    const params = doc.paths['/api/v1/students/{id}'].get.parameters;
    expect(params).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'id', in: 'path' })]),
    );
  });

  it('NFR-01 route không public có security bearer và x-roles = roles; route public không có security', () => {
    for (const r of routes) {
      const op = doc.paths[toOpenApiPath(r.path)][r.method.toLowerCase()];
      if (r.isPublic) {
        expect(op.security ?? []).toEqual([]);
      } else {
        expect(op.security).toEqual([{ bearer: [] }]);
        expect(op['x-roles']).toEqual(r.roles);
      }
    }
  });

  it('GET /api/docs trả Swagger UI (html)', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/docs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

describe('H-04 OpenAPI — NODE_ENV=production', () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, MONGODB_URI: process.env.MONGODB_URI };
  let app: NestExpressApplication;

  beforeAll(async () => {
    const base = process.env.MONGO_TEST_URI;
    if (!base) throw new Error('MONGO_TEST_URI is not set; run via jest-security.config.ts');
    process.env.MONGODB_URI = base.replace('/?', `/lc_test_${randomBytes(6).toString('hex')}?`);
    process.env.NODE_ENV = 'production';
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    setupApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.get<Connection>(getConnectionToken()).dropDatabase();
    await app.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('NFR-01 production → /api/docs và /api/docs-json 404', async () => {
    const server = app.getHttpServer();
    expect((await request(server).get('/api/docs')).status).toBe(404);
    expect((await request(server).get('/api/docs-json')).status).toBe(404);
  });
});

describe.each(['staging', 'prod'])('H-04 OpenAPI — NODE_ENV=%s (fail-closed)', (nodeEnv) => {
  const saved = { NODE_ENV: process.env.NODE_ENV, MONGODB_URI: process.env.MONGODB_URI };
  let app: NestExpressApplication;

  beforeAll(async () => {
    const base = process.env.MONGO_TEST_URI;
    if (!base) throw new Error('MONGO_TEST_URI is not set; run via jest-security.config.ts');
    process.env.MONGODB_URI = base.replace('/?', `/lc_test_${randomBytes(6).toString('hex')}?`);
    process.env.NODE_ENV = nodeEnv;
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    setupApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.get<Connection>(getConnectionToken()).dropDatabase();
    await app.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('NFR-01 NODE_ENV ngoài {development,e2e,test} → /api/docs và /api/docs-json 404', async () => {
    const server = app.getHttpServer();
    expect((await request(server).get('/api/docs')).status).toBe(404);
    expect((await request(server).get('/api/docs-json')).status).toBe(404);
  });
});
