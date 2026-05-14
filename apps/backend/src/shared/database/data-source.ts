import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config(); // load .env when invoked directly by TypeORM CLI

if (!process.env['DATABASE_URL']) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env['DATABASE_URL'],
  synchronize: false,
  migrationsRun: false,
  logging: process.env['NODE_ENV'] === 'development' ? ['query', 'error'] : ['error'],
  entities: [__dirname + '/../../contexts/**/infrastructure/entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../../contexts/**/infrastructure/migrations/*{.ts,.js}'],
  subscribers: [],
});
