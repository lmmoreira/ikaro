import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, type BaseDataSourceOptions } from './build-data-source-options';

config(); // load .env when invoked directly by TypeORM CLI

const baseOptions: BaseDataSourceOptions = {
  type: 'postgres',
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

// TypeORM's CLI (CommandUtils.loadDataSource) awaits an exported Promise<DataSource> — verified
// against the installed typeorm@1.1.0 source, not assumed. buildDataSourceOptions (TD33) picks
// between a local raw-TCP DataSource and a Cloud SQL Connector-backed one for staging/production.
export const AppDataSource = buildDataSourceOptions(process.env, baseOptions).then(
  (options) => new DataSource(options),
);
