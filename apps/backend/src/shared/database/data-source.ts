import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config(); // load .env when invoked directly by TypeORM CLI

const required = ['DB_HOST', 'DB_MIGRATOR_USER', 'DB_MIGRATOR_PASSWORD', 'DB_NAME'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env['DB_HOST'],
  port: Number(process.env['DB_PORT'] ?? 5432),
  username: process.env['DB_MIGRATOR_USER'],
  password: process.env['DB_MIGRATOR_PASSWORD'],
  database: process.env['DB_NAME'],
  // Cloud SQL enforces ssl_mode=ENCRYPTED_ONLY (not the stricter mTLS mode --
  // modules/database's own Checkov-skip comment documents that choice), so
  // rejectUnauthorized: false matches the declared posture rather than
  // relaxing it: encrypted in transit, no client-cert verification required.
  // Local/CI Postgres (Testcontainers, docker-compose) has no SSL at all.
  ssl: process.env['APP_ENV'] !== 'local' ? { rejectUnauthorized: false } : undefined,
  synchronize: false,
  migrationsRun: false,
  logging: process.env['NODE_ENV'] === 'development' ? ['query', 'error'] : ['error'],
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
});
