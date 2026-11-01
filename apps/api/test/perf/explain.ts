import mongoose, { Connection, Types } from 'mongoose';

/** One driver call seen through `mongoose.set('debug', fn)`: collection name, method, casted arguments. */
export interface CapturedQuery {
  collection: string;
  method: string;
  args: unknown[];
}

/**
 * Read methods we check; writes and other calls are reported, not explained. `estimatedDocumentCount` (Ruling R11:
 * `paginate` uses it when the filter is empty) reads collection metadata, has no query plan and never scans.
 */
const EXPLAINABLE = new Set(['find', 'findOne', 'aggregate', 'countDocuments', 'distinct', 'estimatedDocumentCount']);

export function isExplainable(q: CapturedQuery): boolean {
  return EXPLAINABLE.has(q.method);
}

/**
 * Runs `fn` with Mongoose debug pointed at a collector and returns every driver call it made.
 * Debug is global, so callers must not run other queries concurrently (the perf run is sequential).
 */
export async function captureQueries(fn: () => Promise<unknown>): Promise<CapturedQuery[]> {
  const captured: CapturedQuery[] = [];
  const previous = mongoose.get('debug');
  mongoose.set('debug', (collection: string, method: string, ...args: unknown[]) => {
    captured.push({ collection, method, args });
  });
  try {
    await fn();
  } finally {
    mongoose.set('debug', previous ?? false);
  }
  return captured;
}

type Doc = Record<string, unknown>;

function pickFindOptions(opts: unknown): Doc {
  const o = (opts ?? {}) as Doc;
  const out: Doc = {};
  for (const k of ['projection', 'sort', 'limit', 'skip', 'hint', 'collation']) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

/**
 * True when any winning-plan node (any depth: inputStage(s), aggregate $cursor stages, SBE queryPlan) is a
 * COLLSCAN, or an SBE EQ_LOOKUP whose strategy is not IndexedLoopJoin (Hash/NestedLoopJoin scan the foreign
 * collection). Rejected plans are ignored. Classic-engine $lookup/$unionWith foreign sides are not in this
 * output; hasCollscan explains them separately.
 */
export function planHasCollscan(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(planHasCollscan);
  if (!node || typeof node !== 'object') return false;
  const obj = node as Doc;
  if (obj.stage === 'COLLSCAN') return true;
  if (obj.stage === 'EQ_LOOKUP' && obj.strategy !== 'IndexedLoopJoin') return true;
  return Object.entries(obj).some(([k, v]) => k !== 'rejectedPlans' && planHasCollscan(v));
}

/** Raw `explain('queryPlanner')` of a captured read (find/findOne/aggregate/countDocuments/distinct). */
export async function explainQuery(conn: Connection, q: CapturedQuery): Promise<Doc> {
  const coll = conn.db!.collection(q.collection);
  const [a0, a1] = q.args;
  switch (q.method) {
    case 'find':
    case 'findOne':
      return coll.find((a0 ?? {}) as Doc, { ...pickFindOptions(a1), ...(q.method === 'findOne' ? { limit: 1 } : {}) }).explain('queryPlanner');
    case 'aggregate':
      return coll.aggregate(a0 as Doc[]).explain('queryPlanner');
    case 'countDocuments': {
      // Same pipeline the driver runs for countDocuments.
      const o = (a1 ?? {}) as Doc;
      const pipeline: Doc[] = [{ $match: (a0 ?? {}) as Doc }];
      if (typeof o.skip === 'number') pipeline.push({ $skip: o.skip });
      if (typeof o.limit === 'number') pipeline.push({ $limit: o.limit });
      pipeline.push({ $group: { _id: 1, n: { $sum: 1 } } });
      return coll.aggregate(pipeline).explain('queryPlanner');
    }
    case 'distinct':
      return conn.db!.command({ explain: { distinct: q.collection, key: a0, query: a1 ?? {} }, verbosity: 'queryPlanner' });
    default:
      throw new Error(`hasCollscan: cannot explain ${q.collection}.${q.method}`);
  }
}

async function aggregateScans(conn: Connection, coll: string, pipeline: Doc[], letVars: Doc): Promise<boolean> {
  const plan = await conn.db!.collection(coll).aggregate(pipeline, Object.keys(letVars).length ? { let: letVars } : {}).explain('queryPlanner');
  return planHasCollscan(plan) || foreignScans(conn, pipeline);
}

/**
 * Explains the foreign side of every $lookup (and $unionWith, also inside $facet) on its own collection:
 * a placeholder equality on `foreignField` stands for the per-document lookup, prepended to the
 * sub-pipeline; `let` variables are bound to null. Nested lookups recurse.
 */
async function foreignScans(conn: Connection, pipeline: Doc[]): Promise<boolean> {
  for (const stage of pipeline) {
    const lookup = stage.$lookup as Doc | undefined;
    if (lookup) {
      const pre = typeof lookup.foreignField === 'string' ? [{ $match: { [lookup.foreignField]: new Types.ObjectId() } }] : [];
      const letVars = Object.fromEntries(Object.keys((lookup.let as Doc | undefined) ?? {}).map((k) => [k, null]));
      if (await aggregateScans(conn, lookup.from as string, [...pre, ...((lookup.pipeline as Doc[] | undefined) ?? [])], letVars)) return true;
    }
    const union = stage.$unionWith as string | Doc | undefined;
    if (union) {
      const u = typeof union === 'string' ? { coll: union } : union;
      if (await aggregateScans(conn, u.coll as string, (u.pipeline as Doc[] | undefined) ?? [], {})) return true;
    }
    const facet = stage.$facet as Record<string, Doc[]> | undefined;
    if (facet) for (const sub of Object.values(facet)) if (await foreignScans(conn, sub)) return true;
  }
  return false;
}

/** Explains the captured read (queryPlanner), walks the winning plan, then the foreign sides of an aggregate. */
export async function hasCollscan(conn: Connection, q: CapturedQuery): Promise<boolean> {
  if (q.method === 'estimatedDocumentCount') return false; // metadata count (R11): no plan, no COLLSCAN
  if (planHasCollscan(await explainQuery(conn, q))) return true;
  return q.method === 'aggregate' ? foreignScans(conn, q.args[0] as Doc[]) : false;
}

/** Nearest-rank p95: element at index ceil(0.95·n) − 1 of the ascending copy. */
export function p95(ms: number[]): number {
  if (ms.length === 0) throw new Error('p95 of an empty sample');
  const sorted = [...ms].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}
