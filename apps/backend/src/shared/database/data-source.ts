import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { getCloudSqlConnectorExtra } from '../infrastructure/database/cloud-sql-connector.adapter';

config(); // load .env when invoked directly by TypeORM CLI

const appEnv = process.env['APP_ENV'] ?? 'local';

function requireEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

const baseOptions = {
  type: 'postgres' as const,
  username: process.env['DB_MIGRATOR_USER'],
  password: process.env['DB_MIGRATOR_PASSWORD'],
  database: process.env['DB_NAME'],
  synchronize: false,
  migrationsRun: false,
  logging: (process.env['NODE_ENV'] === 'development' ? ['query', 'error'] : ['error']) as (
    'query' | 'error'
  )[],
  entities: [
    __dirname + '/../../contexts/**/infrastructure/entities/*.entity{.ts,.js}',
    // shared/infrastructure/ entities (e.g. outbox/outbox-event.entity.ts, TD24-S01) live outside
    // contexts/** — a separate glob is required or they silently fail to load.
    __dirname + '/../infrastructure/**/*.entity{.ts,.js}',
  ],
  migrations: [
    __dirname + '/../../contexts/**/infrastructure/migrations/*{.ts,.js}',
    // shared/infrastructure/migrations/ (e.g. AddSharedSchema, CreateSharedOutbox, TD24-S01) is
    // not a context — the migration CLI would never see these without a separate glob.
    __dirname + '/../infrastructure/migrations/*{.ts,.js}',
  ],
  subscribers: [],
};

// TD33 — local/CI Testcontainers Postgres has no Cloud SQL instance and no TLS at all;
// staging/production route via the Cloud SQL Connector instead of a raw TCP host/port. The
// TypeORM CLI (CommandUtils.loadDataSource) awaits an exported Promise<DataSource>, so an async
// factory here is the supported mechanism for building it — verified against the installed
// typeorm@1.1.0 source, not assumed.
async function buildDataSource(): Promise<DataSource> {
  if (appEnv === 'local') {
    requireEnv(['DB_HOST', 'DB_MIGRATOR_USER', 'DB_MIGRATOR_PASSWORD', 'DB_NAME']);
    const options: DataSourceOptions = {
      ...baseOptions,
      host: process.env['DB_HOST'],
      port: Number(process.env['DB_PORT'] ?? 5432),
    };
    return new DataSource(options);
  }

  requireEnv([
    'DB_INSTANCE_CONNECTION_NAME',
    'DB_MIGRATOR_USER',
    'DB_MIGRATOR_PASSWORD',
    'DB_NAME',
  ]);
  const options: DataSourceOptions = {
    ...baseOptions,
    extra: await getCloudSqlConnectorExtra(process.env['DB_INSTANCE_CONNECTION_NAME'] as string),
  };
  return new DataSource(options);
}

export const AppDataSource = buildDataSource();
