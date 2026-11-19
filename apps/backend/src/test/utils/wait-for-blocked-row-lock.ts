import type { DataSource } from 'typeorm';
import { waitFor } from './wait-for';

/**
 * Waits until some backend is parked on a row lock. Bounded: a lock wait that never appears fails
 * the test instead of hanging it, and a lock test that passes with the lock removed is not
 * coverage, so this is the proof that a second transaction really did block.
 *
 * `queryContains` narrows the probe to a session whose current statement contains that text:
 * without it any lock wait in the database satisfies the probe, including one from another spec
 * running in parallel against the same container. Postgres keeps only the first 1024 characters of
 * a statement in `pg_stat_activity.query`, so name something near the start of it (the entity alias
 * that opens a TypeORM SELECT list), not the FROM clause of a wide table.
 */
export async function waitForBlockedRowLock(
  dataSource: DataSource,
  queryContains = '',
): Promise<void> {
  try {
    await waitFor(async () => {
      const [{ waiting }] = await dataSource.query<{ waiting: number }[]>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query ILIKE '%' || $1 || '%'`,
        [queryContains],
      );
      return waiting > 0;
    });
  } catch {
    throw new Error('no transaction ever blocked on the row lock');
  }
}
