import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { StartedTestContainer } from 'testcontainers';

export default async function globalTeardown(): Promise<void> {
  const g = globalThis as Record<string, unknown>;

  await Promise.all([
    (g['__TC_PG_CONTAINER__'] as StartedPostgreSqlContainer | undefined)?.stop(),
    (g['__TC_PUBSUB_CONTAINER__'] as StartedTestContainer | undefined)?.stop(),
  ]);
}
