import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

function buildHealthAppModule(): TestingModuleBuilder {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: process.env['TEST_DATABASE_URL'],
        entities: [],
        synchronize: false,
      }),
      TerminusModule,
    ],
    controllers: [HealthController],
  });
}

describe('HealthController (integration)', () => {
  describe('when the database is reachable', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await buildHealthAppModule().compile();
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /health/live returns 200', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('GET /health/ready returns 200 with the database check reported up', async () => {
      const res = await request(app.getHttpServer()).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.info.database.status).toBe('up');
    });
  });

  describe('when the database is unreachable', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await buildHealthAppModule().compile();
      app = moduleRef.createNestApplication();
      await app.init();

      // Own dedicated connection for this describe block only — destroying it does not
      // touch the Testcontainers Postgres shared across the rest of the integration suite.
      await moduleRef.get(DataSource).destroy();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /health/ready returns 503 with the database check reported down', async () => {
      const res = await request(app.getHttpServer()).get('/health/ready');
      expect(res.status).toBe(503);
      expect(res.body.error.database.status).toBe('down');
    });

    it('GET /health/live still returns 200 even though the database is down', async () => {
      const res = await request(app.getHttpServer()).get('/health/live');
      expect(res.status).toBe(200);
    });
  });
});
