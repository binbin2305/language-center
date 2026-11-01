import { ErrorCode, Role } from '@lc/shared';
import { listRoutes, RouteInfo } from '../../src/common/routes/route-inventory';
import { seedTwoStudents, StudentWorld } from '../factories/l-hardening.extra';
import { DEFAULT_PASSWORD } from '../factories/user.factory';
import { createTestApp, TestApp } from '../helpers/test-app';
import { routeLabel, staticRoutes } from './static-routes';

/**
 * H-01B (D35, Review Focus 3): a STUDENT must not read another student's resources.
 * Every GET route with a `:param` must be listed (by exact path) in PARAM_FIXTURES or NOT_STUDENT_OWNED —
 * a new route without an entry fails by name. Routes a STUDENT may call are first proven 2xx with the
 * student's own ids, so a 404 for B's id cannot come from a broken fixture.
 */
type Ids = (w: StudentWorld) => Record<string, string>;

/** Exact route path → the resource ids (per :param) of a given student world. */
const PARAM_FIXTURES: Record<string, Ids> = {
  '/students/:id': (w) => ({ id: w.studentId }),
  '/students/:id/audit': (w) => ({ id: w.studentId }),
  '/students/:id/documents/:docId': (w) => ({ id: w.studentId, docId: w.documentId }),
  '/invoices/:id': (w) => ({ id: w.invoiceId }),
  '/payments/:id/receipt.pdf': (w) => ({ id: w.paymentId }),
  '/classes/:id': (w) => ({ id: w.classId }),
  '/classes/:id/students': (w) => ({ id: w.classId }),
  '/classes/:id/assessments': (w) => ({ id: w.classId }),
  '/sessions/:id': (w) => ({ id: w.sessionId }),
  '/sessions/:id/attendance': (w) => ({ id: w.sessionId }),
  '/assessments/:id/grades': (w) => ({ id: w.assessmentId }),
  '/placement-tests/:id': (w) => ({ id: w.placementTestId }),
  '/leads/:id': (w) => ({ id: w.leadId }),
  '/users/:id': (w) => ({ id: w.userId }),
};

/** Routes whose resource belongs to no student; each with the reason and a real id to call it with. */
const NOT_STUDENT_OWNED: Record<string, { reason: string; ids: Ids }> = {
  '/courses/:id': { reason: 'danh mục khóa học dùng chung, mọi vai trò được xem (FR-CRS)', ids: (w) => ({ id: w.courseId }) },
  '/rooms/:id': { reason: 'phòng học là tài nguyên của trung tâm, chỉ M/S', ids: (w) => ({ id: w.roomId }) },
  '/reports/:type/export': { reason: ':type là loại báo cáo, không phải id tài nguyên; chỉ M/S', ids: () => ({ type: 'finance' }) },
};

/** GET :param routes whose @Roles contain STUDENT (asserted against listRoutes below). */
const STUDENT_GET_PARAM = [
  'GET /classes/:id',
  'GET /classes/:id/assessments',
  'GET /courses/:id',
  'GET /invoices/:id',
  'GET /payments/:id/receipt.pdf',
  'GET /sessions/:id',
  'GET /students/:id',
];

const GET_PARAM = staticRoutes().filter((r) => r.method === 'GET' && r.hasParams);
const ALL_CASES = GET_PARAM.map((r) => [routeLabel(r), r.path] as const);
const STUDENT_CASES = ALL_CASES.filter(([name]) => STUDENT_GET_PARAM.includes(name));
/** Every GET :param route except NOT_STUDENT_OWNED ones (a route with no entry stays here and fails in idsFor). */
const CROSS_CASES = ALL_CASES.filter(([, path]) => !(path in NOT_STUDENT_OWNED));
const SHARED_CASES = ALL_CASES.filter(([, path]) => path in NOT_STUDENT_OWNED);

/** JSON body even when the route declares another Content-Type (receipt.pdf errors arrive as a Buffer). */
function bodyOf(res: { body: unknown; text?: string }): unknown {
  if (Buffer.isBuffer(res.body)) return JSON.parse(res.body.toString('utf8')) as unknown;
  return res.body;
}

function fill(path: string, ids: Record<string, string>): string {
  return path.replace(/:(\w+)/g, (_m, p: string) => {
    const v = ids[p];
    if (!v) throw new Error(`thiếu fixture cho :${p} của ${path}`);
    return v;
  });
}

function idsFor(path: string, w: StudentWorld): Record<string, string> {
  const fx = PARAM_FIXTURES[path] ?? NOT_STUDENT_OWNED[path]?.ids;
  if (!fx) throw new Error(`GET ${path} chưa có trong PARAM_FIXTURES hoặc NOT_STUDENT_OWNED`);
  return fx(w);
}

describe('NFR-01 FR-STU-02 FR-FEE-06 FR-GRD-06 FR-ATT-04 Phạm vi HV', () => {
  let t: TestApp;
  let inventory: RouteInfo[];
  let a: StudentWorld;
  let b: StudentWorld;

  beforeAll(async () => {
    t = await createTestApp();
    inventory = listRoutes(t.app);
    const login = async (username: string) => {
      const res = await t.http().post('/api/v1/auth/login').send({ username, password: DEFAULT_PASSWORD });
      if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body.data.accessToken as string;
    };
    ({ a, b } = await seedTwoStudents(t.conn, login));
  });
  afterAll(async () => {
    await t.close();
  });

  const get = (url: string, token: string) => t.http().get(`/api/v1${url}`).set('Authorization', `Bearer ${token}`);
  const rolesOf = (path: string) => inventory.find((r) => r.method === 'GET' && r.path === path)?.roles ?? [];

  it('mọi route GET có :param đều có trong PARAM_FIXTURES hoặc NOT_STUDENT_OWNED', () => {
    const missing = GET_PARAM.filter((r) => !PARAM_FIXTURES[r.path] && !NOT_STUDENT_OWNED[r.path]).map(routeLabel);
    expect(missing).toEqual([]);
    const known = new Set(GET_PARAM.map((r) => r.path));
    const stale = [...Object.keys(PARAM_FIXTURES), ...Object.keys(NOT_STUDENT_OWNED)].filter((p) => !known.has(p));
    expect(stale).toEqual([]);
    for (const p of Object.keys(PARAM_FIXTURES)) expect(NOT_STUDENT_OWNED[p]).toBeUndefined();
  });

  it('bảng GET :param = listRoutes(app); STUDENT_GET_PARAM = đúng các route có STUDENT trong @Roles', () => {
    const live = inventory.filter((r) => r.method === 'GET' && r.params.length > 0);
    expect(GET_PARAM.map(routeLabel)).toEqual(live.map(routeLabel));
    expect(live.filter((r) => r.roles?.includes(Role.STUDENT)).map(routeLabel).sort()).toEqual([...STUDENT_GET_PARAM].sort());
    expect(STUDENT_CASES).toHaveLength(STUDENT_GET_PARAM.length);
  });

  it('fixture A và B khác nhau ở mọi id (A, B ở hai lớp khác nhau)', () => {
    for (const k of Object.keys(a) as Array<keyof StudentWorld>) expect(a[k]).not.toBe(b[k]);
  });

  it.each(STUDENT_CASES)('%s với id của chính HV A → 2xx', async (_name, path) => {
    const res = await get(fill(path, idsFor(path, a)), a.token);
    expect(`${path} → ${res.status} ${res.status >= 300 ? JSON.stringify(res.body) : ''}`.trim()).toMatch(/→ 2\d\d$/);
  });

  it.each(CROSS_CASES)('%s HV A với id của HV B → 403 hoặc 404, không 200', async (name, path) => {
    if (rolesOf(path).includes(Role.STUDENT)) {
      // Proves the fixture: A's own id reaches the handler and succeeds before B's id counts.
      const own = await get(fill(path, idsFor(path, a)), a.token);
      expect(`${name} id của A → ${own.status}`).toMatch(/→ 2\d\d$/);
    }
    const res = await get(fill(path, idsFor(path, b)), a.token);
    expect(`${name} id của B → ${res.status}`).toMatch(/→ 40[34]$/);
    const body = bodyOf(res);
    expect(body).toMatchObject({ error: { code: res.status === 403 ? ErrorCode.FORBIDDEN : ErrorCode.NOT_FOUND } });
    expect(JSON.stringify(body)).not.toContain(b.studentId);
  });

  it.each(SHARED_CASES)('%s (NOT_STUDENT_OWNED, có lý do): @Roles có STUDENT → 2xx, ngược lại 403', async (name, path) => {
    expect(NOT_STUDENT_OWNED[path].reason.length).toBeGreaterThan(0);
    const res = await get(fill(path, idsFor(path, b)), a.token);
    if (rolesOf(path).includes(Role.STUDENT)) expect(`${name} → ${res.status}`).toMatch(/→ 2\d\d$/);
    else expect(`${name} → ${res.status}`).toMatch(/→ 403$/);
  });

  describe('query scope: HV A lọc theo studentId của B không thấy dữ liệu B', () => {
    const leaksB = (body: unknown) => {
      const s = JSON.stringify(body);
      return [b.studentId, b.invoiceId, b.classId, b.sessionId, b.enrollmentId].filter((id) => s.includes(id));
    };

    it('FR-FEE-06 GET /invoices?studentId=<B> → rỗng hoặc 403; với <A> thấy hóa đơn của A', async () => {
      const own = await get(`/invoices?studentId=${a.studentId}`, a.token);
      expect(own.status).toBe(200);
      expect(JSON.stringify(own.body)).toContain(a.invoiceId);
      const res = await get(`/invoices?studentId=${b.studentId}`, a.token);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(leaksB(res.body)).toEqual([]);
    });

    it('FR-GRD-06 GET /results?studentId=<B> → không chứa dữ liệu B; với <A> thấy kết quả lớp của A', async () => {
      const own = await get(`/results?studentId=${a.studentId}`, a.token);
      expect(own.status).toBe(200);
      expect(JSON.stringify(own.body)).toContain(a.classId);
      const res = await get(`/results?studentId=${b.studentId}`, a.token);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      expect(leaksB(res.body)).toEqual([]);
    });

    it('FR-ATT-04 GET /attendance?studentId=<B> → không chứa dữ liệu B; với <A> thấy điểm danh của A', async () => {
      const own = await get(`/attendance?studentId=${a.studentId}`, a.token);
      expect(own.status).toBe(200);
      expect(JSON.stringify(own.body)).toContain(a.sessionId);
      const res = await get(`/attendance?studentId=${b.studentId}`, a.token);
      if (res.status === 403) return;
      expect(res.status).toBe(200);
      expect(leaksB(res.body)).toEqual([]);
    });
  });
});
