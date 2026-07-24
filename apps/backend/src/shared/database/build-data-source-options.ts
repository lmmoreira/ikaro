import type { DataSourceOptions } from 'typeorm';
import { getCloudSqlConnectorExtra } from '../infrastructure/database/cloud-sql-connector.adapter';

export function requireEnv(env: NodeJS.ProcessEnv, keys: string[]): void {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export interface BaseDataSourceOptions {
  type: 'postgres';
  username: string | undefined;
  password: string | undefined;
  database: string | undefined;
  synchronize: false;
  migrationsRun: false;
  logging: ('query' | 'error')[];
  entities: string[];
  migrations: string[];
  subscribers: never[];
}

// TD33 — local/CI Testcontainers Postgres has no Cloud SQL instance and no TLS at all;
// staging/production route via the Cloud SQL Connector instead of a raw TCP host/port. Extracted
// out of data-source.ts (the TypeORM CLI entry point, which is excluded from coverage collection
// as a side-effecting bootstrap file, same category as main.ts/tracing.ts) so this branching
// logic has direct, first-class test coverage rather than none.
export async function buildDataSourceOptions(
  env: NodeJS.ProcessEnv,
  base: BaseDataSourceOptions,
): Promise<DataSourceOptions> {
  const appEnv = env['APP_ENV'] ?? 'local';

  if (appEnv === 'local') {
    requireEnv(env, ['DB_HOST', 'DB_MIGRATOR_USER', 'DB_MIGRATOR_PASSWORD', 'DB_NAME']);
    const options: DataSourceOptions = {
      ...base,
      host: env['DB_HOST'],
      port: Number(env['DB_PORT'] ?? 5432),
    };
    return options;
  }

  requireEnv(env, [
    'DB_INSTANCE_CONNECTION_NAME',
    'DB_MIGRATOR_USER',
    'DB_MIGRATOR_PASSWORD',
    'DB_NAME',
  ]);
  const options: DataSourceOptions = {
    ...base,
    extra: await getCloudSqlConnectorExtra(env['DB_INSTANCE_CONNECTION_NAME'] as string),
  };
  return options;
}
