import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { StartedTestContainer } from 'testcontainers';

export default async function globalTeardown(): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  await (g['__TC_PG_CONTAINER__'] as StartedPostgreSqlContainer | undefined)?.stop();
  await (g['__TC_GCS_CONTAINER__'] as StartedTestContainer | undefined)?.stop();
}
