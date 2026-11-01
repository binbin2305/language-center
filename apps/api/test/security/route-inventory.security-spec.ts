import { CreateLeadInput } from '@lc/shared';
import { listRoutes, RouteInfo } from '../../src/common/routes/route-inventory';
import { createTestApp, TestApp } from '../helpers/test-app';

describe('listRoutes(app) — route inventory cho sweep bảo mật và OpenAPI', () => {
  let t: TestApp;
  let routes: RouteInfo[];
  const find = (method: RouteInfo['method'], path: string) =>
    routes.find((r) => r.method === method && r.path === path);

  beforeAll(async () => {
    t = await createTestApp();
    routes = listRoutes(t.app);
  });
  afterAll(async () => {
    await t.close();
  });

  it('GET /students/:id có roles và params [id]', () => {
    const r = find('GET', '/students/:id');
    expect(r).toBeDefined();
    expect(r?.roles?.length).toBeGreaterThan(0);
    expect(r?.params).toEqual(['id']);
    expect(r?.isPublic).toBe(false);
    expect(r?.controller).toBe('StudentsController');
  });

  it('POST /auth/login isPublic (và allowPasswordChange từ controller)', () => {
    const r = find('POST', '/auth/login');
    expect(r).toMatchObject({
      isPublic: true,
      allowPasswordChange: true,
      handler: expect.any(String),
    });
  });

  it('POST /leads có schemas.body = CreateLeadInput', () => {
    expect(find('POST', '/leads')?.schemas.body).toBe(CreateLeadInput);
  });

  it('GET /health public, không có params', () => {
    expect(find('GET', '/health')).toMatchObject({ isPublic: true, params: [] });
  });

  it('không có route trùng method+path; danh sách sắp theo method+path', () => {
    const keys = routes.map((r) => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(routes.length).toBeGreaterThan(50);
    const sorted = [...routes].sort(
      (a, b) => a.method.localeCompare(b.method) || a.path.localeCompare(b.path),
    );
    expect(routes).toEqual(sorted);
  });

  it('mọi route không public đều có @Roles (fail closed)', () => {
    expect(
      routes.filter((r) => !r.isPublic && !r.roles?.length).map((r) => `${r.method} ${r.path}`),
    ).toEqual([]);
  });
});
