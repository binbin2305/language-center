import { request, type APIRequestContext } from '@playwright/test';
import { ACCOUNTS, DEMO_TODAY, type Account } from './accounts';

/** Same origin as the browser: vite preview proxies /api to the api (D29). */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
const API_ROOT = `${BASE_URL}/api/v1/`;

/** API context authenticated as `acc` (POST /api/v1/auth/login, Bearer token). Paths are relative: `ctx.get('sessions')`. */
export async function apiAs(acc: Account): Promise<APIRequestContext> {
  const anon = await request.newContext({ baseURL: API_ROOT });
  try {
    const res = await anon.post('auth/login', { data: { username: acc.username, password: acc.password } });
    if (!res.ok()) throw new Error(`login ${acc.username} → ${res.status()} ${await res.text()}`);
    const { data } = (await res.json()) as { data: { accessToken: string } };
    return await request.newContext({ baseURL: API_ROOT, extraHTTPHeaders: { Authorization: `Bearer ${data.accessToken}` } });
  } finally {
    await anon.dispose();
  }
}

interface SessionRow {
  id: string;
  teacherId: string;
  status: string;
  attendanceTakenAt: string | null;
  classCode?: string;
}

const TEACHERS = [ACCOUNTS.teacher1, ACCOUNTS.teacher2, ACCOUNTS.teacher3, ACCOUNTS.teacher4, ACCOUNTS.teacher5];

/** First seeded teacher (teacher1..5 order) with a SCHEDULED session today (DEMO_TODAY) whose attendance is not taken. */
export async function findTeacherWithUntakenSessionToday(): Promise<{ account: Account; sessionId: string; classCode: string }> {
  for (const account of TEACHERS) {
    const ctx = await apiAs(account);
    try {
      const me = (await (await ctx.get('auth/me')).json()) as { data: { id: string } };
      const res = await ctx.get('sessions', { params: { from: DEMO_TODAY, to: DEMO_TODAY } });
      if (!res.ok()) throw new Error(`GET sessions as ${account.username} → ${res.status()}`);
      const { data } = (await res.json()) as { data: SessionRow[] };
      const s = data.find((x) => x.teacherId === me.data.id && x.status === 'SCHEDULED' && x.attendanceTakenAt === null);
      if (s) return { account, sessionId: s.id, classCode: s.classCode ?? '' };
    } finally {
      await ctx.dispose();
    }
  }
  throw new Error(`no teacher has an untaken SCHEDULED session on ${DEMO_TODAY}`);
}
