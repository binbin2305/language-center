import { File as NodeFile } from 'node:buffer';
import { http, HttpResponse } from 'msw';
import type { PageMeta } from '@lc/shared';
import { server } from '../../../test/msw/server';
import { ApiError, apiGet, apiGetBlob, apiGetPage, apiPost, apiPostForm, refreshSession, setOnAuthFailure, tokenStore } from '../api';

const user = { id: 'u1', username: 'a', fullName: 'A', role: 'ADMIN', mustChangePassword: false };

beforeEach(() => {
  tokenStore.clear();
  setOnAuthFailure(() => undefined);
});

describe('api client', () => {
  it('unwrap {data} và gắn Authorization', async () => {
    tokenStore.set('tok');
    let auth: string | null = null;
    server.use(
      http.get('*/api/v1/things', ({ request }) => {
        auth = request.headers.get('authorization');
        return HttpResponse.json({ data: [1, 2] });
      }),
    );
    expect(await apiGet<number[]>('things')).toEqual([1, 2]);
    expect(auth).toBe('Bearer tok');
  });

  it('apiGetPage trả data + meta, truyền searchParams', async () => {
    let q = '';
    server.use(
      http.get('*/api/v1/items', ({ request }) => {
        q = new URL(request.url).search;
        return HttpResponse.json({ data: ['x'], meta: { page: 2, limit: 10, total: 11 } });
      }),
    );
    const r = await apiGetPage<string>('items', { page: 2, q: undefined });
    expect(r.data).toEqual(['x']);
    expect(r.meta).toEqual({ page: 2, limit: 10, total: 11 });
    expectTypeOf(r.meta).toEqualTypeOf<PageMeta>();
    expect(q).toBe('?page=2');
  });

  it('401 lần đầu -> refresh đúng 1 lần -> retry thành công', async () => {
    tokenStore.set('old');
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes++;
        return HttpResponse.json({ data: { accessToken: 'new', user } });
      }),
      http.get('*/api/v1/me-data', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ data: 'ok' })
          : HttpResponse.json(
              { error: { code: 'UNAUTHENTICATED', message: 'x' } },
              { status: 401 },
            ),
      ),
    );
    expect(await apiGet<string>('me-data')).toBe('ok');
    expect(refreshes).toBe(1);
    expect(tokenStore.get()).toBe('new');
  });

  it('hai request 401 song song dùng chung một lần refresh', async () => {
    tokenStore.set('old');
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', async () => {
        refreshes++;
        await new Promise((r) => setTimeout(r, 30));
        return HttpResponse.json({ data: { accessToken: 'new', user } });
      }),
      http.get('*/api/v1/a', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ data: 'a' })
          : HttpResponse.json(
              { error: { code: 'UNAUTHENTICATED', message: 'x' } },
              { status: 401 },
            ),
      ),
      http.get('*/api/v1/b', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? HttpResponse.json({ data: 'b' })
          : HttpResponse.json(
              { error: { code: 'UNAUTHENTICATED', message: 'x' } },
              { status: 401 },
            ),
      ),
    );
    const [a, b] = await Promise.all([apiGet<string>('a'), apiGet<string>('b')]);
    expect([a, b]).toEqual(['a', 'b']);
    expect(refreshes).toBe(1);
  });

  it('refresh trả 401 -> onAuthFailure 1 lần, không retry thêm', async () => {
    tokenStore.set('old');
    const onFail = vi.fn();
    setOnAuthFailure(onFail);
    let refreshes = 0;
    let hits = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes++;
        return HttpResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: 'x' } },
          { status: 401 },
        );
      }),
      http.get('*/api/v1/secret', () => {
        hits++;
        return HttpResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: 'x' } },
          { status: 401 },
        );
      }),
    );
    await expect(apiGet('secret')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(refreshes).toBe(1);
    expect(hits).toBe(1);
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(tokenStore.get()).toBeNull();
  });

  it('401 đến muộn sau khi refresh đã thất bại -> không refresh lần hai, onAuthFailure 1 lần', async () => {
    tokenStore.set('old');
    const onFail = vi.fn();
    setOnAuthFailure(onFail);
    let refreshes = 0;
    const unauth = () =>
      HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, { status: 401 });
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes++;
        return unauth();
      }),
      http.get('*/api/v1/a', () => unauth()),
      http.get('*/api/v1/b', async () => {
        await new Promise((r) => setTimeout(r, 150));
        return unauth();
      }),
    );
    const results = await Promise.allSettled([apiGet('a'), apiGet('b')]);
    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    expect(refreshes).toBe(1);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('refresh lỗi 5xx -> không xóa token, không onAuthFailure', async () => {
    tokenStore.set('old');
    const onFail = vi.fn();
    setOnAuthFailure(onFail);
    server.use(
      http.post('*/api/v1/auth/refresh', () => new HttpResponse('x', { status: 500 })),
      http.get('*/api/v1/a', () =>
        HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, { status: 401 }),
      ),
    );
    await expect(apiGet('a')).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.get()).toBe('old');
    expect(onFail).not.toHaveBeenCalled();
  });

  it('retry vẫn 401 -> không refresh lần nữa', async () => {
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes++;
        return HttpResponse.json({ data: { accessToken: 'new', user } });
      }),
      http.get('*/api/v1/nope', () =>
        HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, { status: 401 }),
      ),
    );
    await expect(apiGet('nope')).rejects.toBeInstanceOf(ApiError);
    expect(refreshes).toBe(1);
  });

  it('401 của /auth/login không kích hoạt refresh', async () => {
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes++;
        return HttpResponse.json({});
      }),
      http.post('*/api/v1/auth/login', () =>
        HttpResponse.json(
          { error: { code: 'INVALID_CREDENTIALS', message: 'x' } },
          { status: 401 },
        ),
      ),
    );
    await expect(apiPost('auth/login', { username: 'a', password: 'b' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(refreshes).toBe(0);
  });

  it('lỗi envelope -> ApiError với code, status, details', async () => {
    server.use(
      http.post('*/api/v1/enroll', () =>
        HttpResponse.json(
          { error: { code: 'CLASS_FULL', message: 'full', details: { fields: { a: 'b' } } } },
          { status: 422 },
        ),
      ),
    );
    const err = await apiPost('enroll', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'CLASS_FULL', status: 422, details: { fields: { a: 'b' } } });
  });

  it('lỗi mạng -> ApiError INTERNAL status 0, thông báo tiếng Việt', async () => {
    server.use(http.get('*/api/v1/down', () => HttpResponse.error()));
    const err = await apiGet('down').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'INTERNAL', status: 0 });
    expect((err as ApiError).message).toMatch(/kết nối/i);
  });

  it('body không phải envelope -> ApiError INTERNAL giữ status', async () => {
    server.use(http.get('*/api/v1/bad', () => new HttpResponse('oops', { status: 502 })));
    await expect(apiGet('bad')).rejects.toMatchObject({ code: 'INTERNAL', status: 502 });
  });
});

describe('refresh giữa nhiều tab (navigator.locks + BroadcastChannel lc-auth)', () => {
  const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
  let otherTab: BroadcastChannel;
  let release: () => void = () => undefined;
  let lockNames: string[] = [];

  beforeEach(() => {
    otherTab = new BroadcastChannel('lc-auth');
    lockNames = [];
    const gate = new Promise<void>((r) => (release = r));
    // Fake Web Locks: the callback runs only once the test releases the lock held by "another tab".
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: {
        request: async (name: string, cb: () => Promise<unknown>) => {
          lockNames.push(name);
          await gate;
          return cb();
        },
      },
    });
  });
  afterEach(() => {
    otherTab.close();
    vi.unstubAllGlobals();
  });

  it('tab khác đã refresh trong lúc chờ khóa → dùng token đó, không gọi /auth/refresh', async () => {
    tokenStore.set('old');
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes++;
        return HttpResponse.json({ data: { accessToken: 'mine', user } });
      }),
    );
    const p = refreshSession();
    await tick();
    otherTab.postMessage({ type: 'refreshed', result: { accessToken: 'from-other-tab', user } });
    await tick();
    release();
    const r = await p;
    expect(lockNames).toEqual(['lc-refresh']);
    expect(r.accessToken).toBe('from-other-tab');
    expect(tokenStore.get()).toBe('from-other-tab');
    expect(refreshes).toBe(0);
  });

  it('tự refresh thành công → phát token mới cho các tab khác', async () => {
    const received: unknown[] = [];
    otherTab.onmessage = (e: MessageEvent) => received.push(e.data);
    server.use(http.post('*/api/v1/auth/refresh', () => HttpResponse.json({ data: { accessToken: 'mine', user } })));
    release();
    expect((await refreshSession()).accessToken).toBe('mine');
    await tick();
    expect(received).toEqual([{ type: 'refreshed', result: { accessToken: 'mine', user } }]);
  });
});

/**
 * jsdom's FormData/File are not understood by Node's fetch (undici), so the request would not be
 * multipart. Build the form with Node's own classes: FormData from a parsed (text-only) multipart
 * body, File from node:buffer.
 */
async function nodeForm(field: string, fileName: string, type: string): Promise<FormData> {
  const form = await new Response('--b--\r\n', {
    headers: { 'content-type': 'multipart/form-data; boundary=b' },
  }).formData();
  form.append(field, new NodeFile(['hello'], fileName, { type }) as unknown as Blob, fileName);
  return form;
}

const readText = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });

describe('apiPostForm / apiGetBlob', () => {
  it('apiPostForm gửi multipart FormData, không set content-type JSON', async () => {
    tokenStore.set('tok');
    let ct: string | null = null;
    let raw = '';
    let auth: string | null = null;
    server.use(
      http.post('*/api/v1/upload', async ({ request }) => {
        ct = request.headers.get('content-type');
        auth = request.headers.get('authorization');
        // request.formData() cannot build jsdom Files here, so inspect the raw multipart body.
        raw = await request.text();
        return HttpResponse.json({ data: { ok: true } }, { status: 201 });
      }),
    );
    const form = await nodeForm('file', 'a.pdf', 'application/pdf');
    expect(await apiPostForm<{ ok: boolean }>('upload', form)).toEqual({ ok: true });
    expect(raw).toContain('name="file"; filename="a.pdf"');
    expect(ct).toMatch(/^multipart\/form-data; boundary=/);
    expect(auth).toBe('Bearer tok');
  });

  it('apiGetBlob trả Blob', async () => {
    tokenStore.set('tok');
    server.use(
      http.get('*/api/v1/file', () => new HttpResponse('bytes', { headers: { 'content-type': 'application/pdf' } })),
    );
    const b = await apiGetBlob('file');
    expect(b).toBeInstanceOf(Blob);
    expect(await readText(b)).toBe('bytes');
  });

  it('apiGetBlob refresh một lần khi 401', async () => {
    tokenStore.set('old');
    let refreshes = 0;
    server.use(
      http.post('*/api/v1/auth/refresh', () => {
        refreshes++;
        return HttpResponse.json({ data: { accessToken: 'new', user } });
      }),
      http.get('*/api/v1/file', ({ request }) =>
        request.headers.get('authorization') === 'Bearer new'
          ? new HttpResponse('ok')
          : HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, { status: 401 }),
      ),
    );
    expect(await readText(await apiGetBlob('file'))).toBe('ok');
    expect(refreshes).toBe(1);
  });
});
