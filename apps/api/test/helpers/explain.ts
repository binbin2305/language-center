import mongoose, { Connection, Types } from 'mongoose';

/** One driver call seen through `mongoose.set('debug', fn)`. */
export interface CapturedQuery {
  collection: string;
  method: string;
  args: unknown[];
}

type Doc = Record<string, unknown>;

/** Metadata-only counts (collection stats, plan RECORD_STORE_FAST_COUNT): never a scan. */
const METADATA = new Set(['estimatedDocumentCount']);
const READS = new Set(['find', 'findOne', 'aggregate', 'countDocuments', 'distinct']);

/** Every driver call `fn` makes. Debug is global: do not run other queries concurrently. */
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

/** COLLSCAN anywhere in the winning plan, or an SBE $lookup that does not loop over an index. */
export function planHasCollscan(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(planHasCollscan);
  if (!node || typeof node !== 'object') return false;
  const o = node as Doc;
  if (o.stage === 'COLLSCAN') return true;
  if (o.stage === 'EQ_LOOKUP' && o.strategy !== 'IndexedLoopJoin') return true;
  return Object.entries(o).some(([k, v]) => k !== 'rejectedPlans' && planHasCollscan(v));
}

async function explain(conn: Connection, q: CapturedQuery): Promise<Doc> {
  const coll = conn.db!.collection(q.collection);
  const [a0, a1] = q.args as [Doc | Doc[] | string | undefined, Doc | undefined];
  switch (q.method) {
    case 'find':
    case 'findOne': {
      const o = a1 ?? {};
      const opts: Doc = {};
      for (const k of ['projection', 'sort', 'limit', 'skip']) if (o[k] !== undefined) opts[k] = o[k];
      if (q.method === 'findOne') opts.limit = 1;
      return coll.find((a0 ?? {}) as Doc, opts).explain('queryPlanner');
    }
    case 'aggregate':
      return coll.aggregate(a0 as Doc[]).explain('queryPlanner');
    case 'countDocuments':
      // The pipeline the driver runs for countDocuments.
      return coll.aggregate([{ $match: (a0 ?? {}) as Doc }, { $group: { _id: 1, n: { $sum: 1 } } }]).explain('queryPlanner');
    case 'distinct':
      return conn.db!.command({ explain: { distinct: q.collection, key: a0, query: a1 ?? {} }, verbosity: 'queryPlanner' });
    default:
      throw new Error(`explain: cannot explain ${q.collection}.${q.method}`);
  }
}

/** Foreign side of each $lookup (also inside $facet), explained with a placeholder equality on foreignField. */
async function foreignScans(conn: Connection, pipeline: Doc[]): Promise<boolean> {
  for (const stage of pipeline) {
    const lookup = stage.$lookup as Doc | undefined;
    if (lookup) {
      const pre = typeof lookup.foreignField === 'string' ? [{ $match: { [lookup.foreignField]: new Types.ObjectId() } }] : [];
      const sub = [...pre, ...((lookup.pipeline as Doc[] | undefined) ?? [])];
      const plan = await conn.db!.collection(lookup.from as string).aggregate(sub).explain('queryPlanner');
      if (planHasCollscan(plan) || (await foreignScans(conn, sub))) return true;
    }
    const facet = stage.$facet as Record<string, Doc[]> | undefined;
    if (facet) for (const sub of Object.values(facet)) if (await foreignScans(conn, sub)) return true;
  }
  return false;
}

/**
 * Explains every read `fn` makes (queryPlanner) and returns a description of each one that scans a whole
 * collection. Throws on a read it cannot classify, and when `fn` makes no read at all (no vacuous pass).
 */
export async function collscansOf(conn: Connection, fn: () => Promise<unknown>): Promise<string[]> {
  const queries = await captureQueries(fn);
  const reads = queries.filter((q) => READS.has(q.method) || METADATA.has(q.method));
  if (reads.length === 0) throw new Error('collscansOf: no read captured');
  const out: string[] = [];
  for (const q of reads) {
    if (METADATA.has(q.method)) continue;
    const scans = planHasCollscan(await explain(conn, q)) || (q.method === 'aggregate' && (await foreignScans(conn, q.args[0] as Doc[])));
    if (scans) out.push(`${q.collection}.${q.method} ${JSON.stringify(q.args[0] ?? {}).slice(0, 300)}`);
  }
  return out;
}
