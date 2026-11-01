/**
 * NFR-02 perf run (D36): p95 < 300ms and no COLLSCAN on the 10 staff list endpoints
 * at 10k students / 500 classes / 50k sessions.
 *
 * Own MongoMemoryReplSet (wiredTiger, temp dbPath) → runSeedDemo → runSeedLarge → in-process app
 * listening on an ephemeral port → per endpoint 5 warm-up + 50 sequential timed requests as the
 * demo manager, then one more request under captureQueries whose reads are explained (queryPlanner).
 * Prints `endpoint | p50 | p95 | COLLSCAN`; exit 1 if any p95 ≥ 300ms, any COLLSCAN or any non-200.
 * Usage: caffeinate -i pnpm --filter api perf   (not part of the full chain; run in H-02 and Task M)
 */
import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { cpus, totalmem, tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { Connection } from 'mongoose';
import { CapturedQuery, captureQueries, explainQuery, hasCollscan, isExplainable, p95 } from './explain';

const STUDENTS = 10_000;
const CLASSES = 500;
const SESSIONS_PER_CLASS = 100;
const WARMUP = 5;
const SAMPLES = 50;
const LIMIT_MS = 300;

interface Row {
  endpoint: string;
  p50: number;
  p95: number;
  rows: string;
  reads: number;
  collscans: string[];
  skipped: string[];
}

const median = (ms: number[]) => [...ms].sort((a, b) => a - b)[Math.ceil(0.5 * ms.length) - 1];
const fmt = (n: number) => n.toFixed(1);

function describeQuery(q: CapturedQuery): string {
  const [a0, a1] = q.args as [unknown, Record<string, unknown> | undefined];
  const opts = q.method === 'find' && a1 ? ` sort=${JSON.stringify(a1.sort ?? null)} limit=${String(a1.limit ?? '-')}` : '';
  const shape = JSON.stringify(a0 ?? {});
  return `${q.collection}.${q.method} ${shape.length > 600 ? `${shape.slice(0, 600)}…` : shape}${opts}`;
}

/** Winning-plan chain, e.g. `LIMIT>FETCH>IXSCAN(startAt_1)`; aggregate explains list each $cursor plan. */
function planSummary(node: unknown): string {
  const plans: string[] = [];
  const chain = (n: Record<string, unknown>): string => {
    const label = `${String(n.stage)}${n.indexName ? `(${String(n.indexName)})` : ''}`;
    const kids = [n.inputStage, ...((n.inputStages as unknown[]) ?? [])].filter(Boolean) as Record<string, unknown>[];
    return kids.length ? `${label}>${kids.map(chain).join('|')}` : label;
  };
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    if (o.winningPlan && typeof o.winningPlan === 'object') {
      const wp = o.winningPlan as Record<string, unknown>;
      plans.push(chain((wp.queryPlan as Record<string, unknown>) ?? wp));
      return;
    }
    for (const [k, v] of Object.entries(o)) if (k !== 'rejectedPlans') walk(v);
  };
  walk(node);
  return plans.join(' ; ') || '?';
}

async function main(): Promise<void> {
  const dbPath = mkdtempSync(join(tmpdir(), 'lc-perf-'));
  const rs = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger', dbName: 'lc_perf' },
    instanceOpts: [{ dbPath, storageEngine: 'wiredTiger' }],
  });
  Object.assign(process.env, {
    MONGODB_URI: rs.getUri('lc_perf'),
    JWT_ACCESS_SECRET: 'perf-access-secret-0123456789-abcdefghij',
    BCRYPT_COST: '4',
    LOGIN_RATE_LIMIT: '1000',
    NODE_ENV: 'perf',
    APP_CLOCK_START: '',
  });

  // Imported after the env is set: some modules call loadEnv() at import time.
  const { NestFactory } = await import('@nestjs/core');
  const { getConnectionToken } = await import('@nestjs/mongoose');
  const { addVnDays } = await import('@lc/shared');
  const { AppModule } = await import('../../src/app.module');
  const { setupApp } = await import('../../src/setup-app');
  const { DEMO_PASSWORD, DEMO_TODAY, runSeedDemo } = await import('../../scripts/seed-demo');
  const { runSeedLarge } = await import('../../scripts/seed-large');

  const app = await NestFactory.create<import('@nestjs/platform-express').NestExpressApplication>(AppModule, { logger: ['error', 'warn'] });
  let failed = false;
  try {
    setupApp(app);
    await app.init();
    const conn = app.get<Connection>(getConnectionToken());
    for (const model of Object.values(conn.models)) await model.syncIndexes();

    const t0 = performance.now();
    await runSeedDemo(app);
    await runSeedLarge(conn, { students: STUDENTS, classes: CLASSES, sessionsPerClass: SESSIONS_PER_CLASS, today: DEMO_TODAY });
    const seedSec = (performance.now() - t0) / 1000;

    const count = (c: string, f: Record<string, unknown> = {}) => conn.db!.collection(c).countDocuments(f);
    const volume = {
      students: await count('students'),
      classes: await count('classes'),
      sessions: await count('sessions'),
      sessionsWithAttendance: await count('sessions', { attendanceTakenAt: { $ne: null } }),
      attendance: await count('attendances'),
      enrollments: await count('enrollments'),
      invoices: await count('invoices'),
      payments: await count('payments'),
      leads: await count('leads'),
    };
    console.log(`Seeded in ${fmt(seedSec)}s:`, JSON.stringify(volume));

    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`.replace('[::1]', '127.0.0.1');
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'manager@center.local', password: DEMO_PASSWORD }),
    });
    if (login.status !== 200) throw new Error(`manager login failed: ${login.status} ${await login.text()}`);
    const token = ((await login.json()) as { data: { accessToken: string } }).data.accessToken;

    const largeClass = await conn.db!.collection('classes').findOne({ code: 'L-0001' }, { projection: { _id: 1 } });
    if (!largeClass) throw new Error('class L-0001 missing');
    const monday = DEMO_TODAY; // 2026-11-02 is a Monday
    const endpoints = [
      '/leads',
      '/students',
      '/students?q=nguyen',
      '/classes',
      `/sessions?from=${monday}&to=${addVnDays(monday, 6)}`,
      '/enrollments/waiting',
      `/attendance?from=${addVnDays(DEMO_TODAY, -29)}&to=${DEMO_TODAY}`,
      `/results?classId=${String(largeClass._id)}`,
      '/invoices',
      '/invoices?overdue=true',
    ];

    const get = async (path: string): Promise<{ ms: number; body: unknown }> => {
      const start = performance.now();
      const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
      const body: unknown = await res.json();
      const ms = performance.now() - start;
      if (res.status !== 200) throw new Error(`GET ${path} → ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
      return { ms, body };
    };

    const rows: Row[] = [];
    for (const path of endpoints) {
      for (let i = 0; i < WARMUP; i++) await get(path);
      const ms: number[] = [];
      let last: unknown;
      for (let i = 0; i < SAMPLES; i++) {
        const r = await get(path);
        ms.push(r.ms);
        last = r.body;
      }
      const queries = await captureQueries(() => get(path));
      const collscans: string[] = [];
      const skipped: string[] = [];
      let reads = 0;
      for (const q of queries) {
        if (!isExplainable(q)) {
          skipped.push(`${q.collection}.${q.method}`);
          continue;
        }
        reads += 1;
        if (await hasCollscan(conn, q)) collscans.push(`${describeQuery(q)}\n    plan: ${planSummary(await explainQuery(conn, q))}`);
      }
      const b = last as { data?: unknown[]; meta?: { total?: number } };
      const n = Array.isArray(b?.data) ? b.data.length : '?';
      rows.push({ endpoint: path, p50: median(ms), p95: p95(ms), rows: b?.meta?.total !== undefined ? `${n}/${b.meta.total}` : String(n), reads, collscans, skipped });
    }

    const mongoVersion = (await conn.db!.admin().buildInfo()).version as string;
    console.log(`\nMachine: ${cpus()[0]?.model ?? '?'} ×${cpus().length}, ${Math.round(totalmem() / 2 ** 30)} GiB, Node ${process.version}, MongoDB ${mongoVersion} (wiredTiger)`);
    console.log(`Samples: ${WARMUP} warm-up + ${SAMPLES} sequential per endpoint, limit p95 < ${LIMIT_MS}ms\n`);
    console.log('| endpoint | p50 (ms) | p95 (ms) | rows (page/total) | reads explained | COLLSCAN |');
    console.log('|---|---:|---:|---:|---:|---|');
    for (const r of rows) {
      const bad = r.p95 >= LIMIT_MS || r.collscans.length > 0;
      if (bad) failed = true;
      console.log(`| \`GET ${r.endpoint}\` | ${fmt(r.p50)} | ${fmt(r.p95)}${r.p95 >= LIMIT_MS ? ' ✗' : ''} | ${r.rows} | ${r.reads} | ${r.collscans.length ? `YES (${r.collscans.length})` : 'no'} |`);
    }
    for (const r of rows) {
      for (const c of r.collscans) console.log(`COLLSCAN in GET ${r.endpoint}: ${c}`);
      if (r.skipped.length) console.log(`not explained in GET ${r.endpoint}: ${r.skipped.join(', ')}`);
    }
    console.log(failed ? '\nNFR-02 FAIL' : '\nNFR-02 PASS');
  } finally {
    await app.close();
    await rs.stop({ doCleanup: true, force: true });
    rmSync(dbPath, { recursive: true, force: true });
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
