import { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export default async function globalTeardown(): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  await (g['__TC_PG_CONTAINER__'] as StartedPostgreSqlContainer | undefined)?.stop();
}
