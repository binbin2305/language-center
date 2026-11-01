import mongoose, { Connection } from 'mongoose';

/** One driver call seen through `mongoose.set('debug', fn)`: collection name, method, casted arguments. */
export interface CapturedQuery {
  collection: string;
  method: string;
  args: unknown[];
}

/** Read methods whose plan we can explain; writes and metadata calls are reported, not explained. */
const EXPLAINABLE = new Set(['find', 'findOne', 'aggregate', 'countDocuments', 'distinct']);

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

/** True when any winning-plan node (any depth, incl. aggregate $cursor stages) is a COLLSCAN; rejected plans are ignored. */
function planHasCollscan(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(planHasCollscan);
  if (!node || typeof node !== 'object') return false;
  const obj = node as Doc;
  if (obj.stage === 'COLLSCAN') return true;
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

/** Explains the captured read with verbosity queryPlanner and walks the winning plan recursively. */
export async function hasCollscan(conn: Connection, q: CapturedQuery): Promise<boolean> {
  return planHasCollscan(await explainQuery(conn, q));
}

/** Nearest-rank p95: element at index ceil(0.95·n) − 1 of the ascending copy. */
export function p95(ms: number[]): number {
  if (ms.length === 0) throw new Error('p95 of an empty sample');
  const sorted = [...ms].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1];
}
