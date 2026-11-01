import { FilterQuery, Model, ProjectionType } from 'mongoose';

export interface PaginationQuery {
  page: number;
  limit: number;
  sort?: string;
}

export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

/** "-createdAt" -> { createdAt: -1 }; comma-separated for multiple keys. */
function parseSort(sort: string): Record<string, 1 | -1> {
  const out: Record<string, 1 | -1> = {};
  for (const part of sort.split(',')) {
    const key = part.trim();
    if (!key) continue;
    if (key.startsWith('-')) out[key.slice(1)] = -1;
    else out[key.startsWith('+') ? key.slice(1) : key] = 1;
  }
  return out;
}

/** True for `{}` and for `$and` lists whose members are all empty: the filter matches every document. */
export function isEmptyFilter(filter: object): boolean {
  const entries = Object.entries(filter);
  return entries.every(([k, v]) => k === '$and' && Array.isArray(v) && v.every((x: object) => isEmptyFilter(x)));
}

/**
 * Total for a list (R11): an empty filter reads collection metadata (estimatedDocumentCount, no scan);
 * any other filter counts through its index with countDocuments.
 */
export function countFor<T>(model: Model<T>, filter: FilterQuery<T>): Promise<number> {
  return isEmptyFilter(filter) ? model.estimatedDocumentCount() : model.countDocuments(filter);
}

export async function paginate<T>(
  model: Model<T>,
  filter: FilterQuery<T>,
  q: PaginationQuery,
  projection?: ProjectionType<T>,
): Promise<Page<T>> {
  // Callers MUST validate q.sort keys against an allow-list; they are passed to Mongo as-is.
  const sortSpec = parseSort(q.sort ?? '-createdAt');
  const dirs = Object.values(sortSpec);
  // Stable tiebreaker follows the direction of the last sort key.
  const sort = { ...sortSpec, _id: dirs[dirs.length - 1] ?? -1 };
  const [data, total] = await Promise.all([
    model
      .find(filter, projection)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    countFor(model, filter),
  ]);
  return { data: data as unknown as T[], meta: { page: q.page, limit: q.limit, total } };
}
