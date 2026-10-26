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

export async function paginate<T>(
  model: Model<T>,
  filter: FilterQuery<T>,
  q: PaginationQuery,
  projection?: ProjectionType<T>,
): Promise<Page<T>> {
  const sort = { ...parseSort(q.sort ?? '-createdAt'), _id: -1 as const };
  const [data, total] = await Promise.all([
    model
      .find(filter, projection)
      .sort(sort)
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    model.countDocuments(filter),
  ]);
  return { data: data as unknown as T[], meta: { page: q.page, limit: q.limit, total } };
}
