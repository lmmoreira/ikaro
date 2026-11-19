import type { DataSource } from 'typeorm';

/**
 * Polls until some backend is parked on a row lock, pausing inside Postgres (`pg_sleep`) so no
 * test-side timer is involved. Bounded: a lock wait that never appears fails the test instead of
 * hanging it. A lock test that passes with the lock removed is not coverage, so this is the proof
 * that a second transaction really did block.
 */
export async function waitForBlockedRowLock(dataSource: DataSource): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt++) {
    const [{ waiting }] = await dataSource.query<{ waiting: number }[]>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (waiting > 0) return;
    await dataSource.query('SELECT pg_sleep(0.01)');
  }
  throw new Error('no transaction ever blocked on the row lock');
}
