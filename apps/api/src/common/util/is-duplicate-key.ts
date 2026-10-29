/** MongoDB duplicate-key error code (E11000). */
export const DUPLICATE_KEY = 11000;

/** True for a MongoDB E11000 duplicate-key error (raised by unique indexes and racing upserts). */
export function isDuplicateKey(e: unknown): e is { code: typeof DUPLICATE_KEY; keyValue?: Record<string, unknown> } {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === DUPLICATE_KEY;
}
