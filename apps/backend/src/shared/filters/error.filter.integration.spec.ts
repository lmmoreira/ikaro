import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { InternalApiGuard } from '../guards/internal-api.guard';
import { CorrelationMiddleware } from '../request/correlation.middleware';
import { ErrorFilter } from './error.filter';

const INTERNAL_KEY = 'integ-error-filter-key-integ-error-filter-key';

@Controller('test-error-filter')
@UseGuards(InternalApiGuard)
class TestController {
  @Get('boom')
  boom(): never {
    throw new Error('database down');
  }
}

// M17-S31 — proves the real production pipeline (InternalApiGuard -> CorrelationMiddleware
// -> ErrorFilter), assembled the same way AppModule wires it, rather than only the shared
// BaseErrorFilter in isolation (packages/nestjs-http/src/base-error.filter.spec.ts).
describe('ErrorFilter (integration — guard rejection + unhandled error)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [TestController],
      providers: [
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: APP_GUARD, useClass: InternalApiGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    const correlationMiddleware = new CorrelationMiddleware();
    app.use((req: Request, res: Response, next: NextFunction) =>
      correlationMiddleware.use(req, res, next),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
  });

  it('a request InternalApiGuard rejects still carries a correlationId, in both the header and the body', async () => {
    const res = await request(app.getHttpServer()).get('/test-error-filter/boom');

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
  });

  it('an incoming X-Correlation-ID survives a guard rejection unchanged', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-error-filter/boom')
      .set('X-Correlation-ID', 'client-supplied-id');

    expect(res.status).toBe(401);
    expect(res.headers['x-correlation-id']).toBe('client-supplied-id');
    expect(res.body.correlationId).toBe('client-supplied-id');
  });

  it('an unhandled controller exception in production mode returns a generic 500 with no stack trace', async () => {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(app.getHttpServer())
        .get('/test-error-filter/boom')
        .set('X-Internal-Key', INTERNAL_KEY);

      expect(res.status).toBe(500);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.detail).toBe('An unexpected error occurred');
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.(ts|js):\d+:\d+/);
    } finally {
      process.env.NODE_ENV = previousEnv;
    }
  });
});
