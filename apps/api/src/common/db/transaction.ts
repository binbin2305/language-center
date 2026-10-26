import { ClientSession, Connection } from 'mongoose';

/**
 * Runs fn inside a transaction (auto-retried on transient errors); rolls back if fn throws.
 * The callback may run MORE THAN ONCE (transient-error retry): keep non-DB side effects
 * (notifications, emails) outside it, after commit.
 */
export async function withTransaction<T>(conn: Connection, fn: (s: ClientSession) => Promise<T>): Promise<T> {
  return conn.transaction(fn);
}
