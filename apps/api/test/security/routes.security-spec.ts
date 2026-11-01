import { ErrorCode, Role } from '@lc/shared';
import { Types } from 'mongoose';
import { listRoutes, RouteInfo } from '../../src/common/routes/route-inventory';
import { loginAs } from '../helpers/auth';
import { createTestApp, TestApp } from '../helpers/test-app';
import { routeLabel, StaticRoute, staticRoutes } from './static-routes';

/** H-01A route sweep (NFR-01). Rows come from the static table, verified against listRoutes(app). */
const TABLE = staticRoutes();
const NON_PUBLIC = TABLE.filter((r) => !r.isPublic).map((r) => [routeLabel(r), r] as const);
const STAFF_GETS = TABLE.filter((r) => !r.isPublic && r.method === 'GET' && !r.hasParams).map(
  (r) => [routeLabel(r), r] as const,
);
const PUBLIC_ROUTES = ['GET /health', 'POST /auth/login', 'POST /auth/refresh'];
const HASH_FIELDS = /passwordHash|tokenHash/;

describe('NFR-01 FR-AUTH-01 Bảo mật route', () => {
  let t: TestApp;
  let inventory: RouteInfo[];
  let adminToken: string;
  let managerToken: string;

  beforeAll(async () => {
    t = await createTestApp();
    inventory = listRoutes(t.app);
    adminToken = (await loginAs(t, Role.ADMIN)).token;
    managerToken = (await loginAs(t, Role.MANAGER)).token;
  });
  afterAll(async () => {
    await t.close();
  });

  const send = (r: StaticRoute, token?: string) => {
    const url = `/api/v1${r.path.replace(/:\w+/g, () => new Types.ObjectId().toHexString())}`;
    const http = t.http();
    const verb = r.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    let req = http[verb](url);
    if (token) req = req.set('Authorization', `Bearer ${token}`);
    return r.method === 'GET' ? req : req.send({});
  };

  it('listRoutes trả ≥ 90 route (chống inventory rỗng)', () => {
    expect(inventory.length).toBeGreaterThanOrEqual(90);
  });

  it('bảng route tĩnh của sweep = đúng listRoutes(app) (không route nào bị bỏ sót)', () => {
    expect(TABLE.map(routeLabel)).toEqual(inventory.map(routeLabel));
    expect(TABLE.map((r) => r.isPublic)).toEqual(inventory.map((r) => r.isPublic));
  });

  it('route public = đúng tập { POST /auth/login, POST /auth/refresh, GET /health } (NFR-01)', () => {
    expect(inventory.filter((r) => r.isPublic).map(routeLabel).sort()).toEqual(PUBLIC_ROUTES);
  });

  it.each(NON_PUBLIC)('%s có @Roles khác rỗng', (name) => {
    const r = inventory.find((x) => routeLabel(x) === name);
    expect(r).toBeDefined();
    expect(r?.roles?.length ?? 0).toBeGreaterThan(0);
    for (const role of r?.roles ?? []) expect(Object.values(Role)).toContain(role);
  });

  it.each(NON_PUBLIC)('%s không token → 401 UNAUTHENTICATED', async (_name, r) => {
    const res = await send(r);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it.each(STAFF_GETS)('%s với ADMIN/MANAGER: body không chứa "passwordHash" | "tokenHash"', async (_name, r) => {
    for (const token of [adminToken, managerToken]) {
      const res = await send(r, token);
      expect(res.status).toBeLessThan(500);
      expect(`${JSON.stringify(res.body ?? null)}${res.text ?? ''}`).not.toMatch(HASH_FIELDS);
    }
  });

  it('chống pass giả: đa số GET staff trả 2xx cho ADMIN hoặc MANAGER; GET /users có dữ liệu user mà không có passwordHash', async () => {
    let ok = 0;
    for (const [, r] of STAFF_GETS) {
      const statuses = [(await send(r, adminToken)).status, (await send(r, managerToken)).status];
      if (statuses.some((s) => s >= 200 && s < 300)) ok++;
    }
    expect(ok).toBeGreaterThan(STAFF_GETS.length / 2);
    const users = await t.http().get('/api/v1/users').set('Authorization', `Bearer ${adminToken}`);
    expect(users.status).toBe(200);
    expect(JSON.stringify(users.body)).toContain('username');
    expect(JSON.stringify(users.body)).not.toMatch(HASH_FIELDS);
  });
});
