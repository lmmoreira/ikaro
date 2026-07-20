import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { InMemoryTenantSettingsPort } from '../../test/infrastructure/in-memory-tenant-settings.port';
import { TENANT_SETTINGS_PORT } from '../ports/tenant-settings.port';
import { RequestContext } from './request-context';
import { RequestInterceptor } from './request.interceptor';
import { RequestModule } from './request.module';
import { CorrelationMiddleware } from './correlation.middleware';

@Controller('test-tenant')
class TenantEchoController {
  constructor(private readonly ctx: RequestContext) {}

  @Get()
  echo() {
    return {
      tenantId: this.ctx.tenantId,
      correlationId: this.ctx.correlationId,
      currency: this.ctx.settings.localization.currency,
    };
  }
}

describe('RequestInterceptor (integration)', () => {
  let app: INestApplication;
  let settingsPort: InMemoryTenantSettingsPort;

  beforeAll(async () => {
    settingsPort = new InMemoryTenantSettingsPort();
    const module = await Test.createTestingModule({
      imports: [RequestModule],
      controllers: [TenantEchoController],
      providers: [
        { provide: TENANT_SETTINGS_PORT, useValue: settingsPort },
        { provide: APP_INTERCEPTOR, useClass: RequestInterceptor },
      ],
    }).compile();

    app = module.createNestApplication();
    // This test module imports only RequestModule (not AppModule), so AppModule's
    // configure()-registered CorrelationMiddleware never runs — register it directly here
    // to reproduce the real Middleware-before-Guards/Interceptors ordering RequestInterceptor
    // now depends on (it no longer generates its own correlationId fallback).
    const correlationMiddleware = new CorrelationMiddleware();
    app.use((req: Request, res: Response, next: NextFunction) =>
      correlationMiddleware.use(req, res, next),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 Problem Detail when X-Tenant-ID header is absent', async () => {
    const res = await request(app.getHttpServer()).get('/test-tenant');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe(400);
    expect(res.body.title).toBe('Missing Tenant Header');
  });

  it('populates RequestContext from request headers, including settings', async () => {
    const tenantId = '01234567-0000-7000-8000-000000000001';
    // CorrelationMiddleware (M17-S31 review, 2026-07-20) only trusts a well-formed UUIDv7 —
    // anything else is replaced with a freshly generated one.
    const correlationId = '01888888-0000-7000-8000-000000000001';
    const res = await request(app.getHttpServer())
      .get('/test-tenant')
      .set('X-Tenant-ID', tenantId)
      .set('X-Correlation-ID', correlationId);

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(tenantId);
    expect(res.body.correlationId).toBe(correlationId);
    expect(res.body.currency).toBe('BRL');
  });

  it('generates a correlationId when X-Correlation-ID is not sent', async () => {
    const tenantId = '01234567-0000-7000-8000-000000000002';
    const res = await request(app.getHttpServer()).get('/test-tenant').set('X-Tenant-ID', tenantId);

    expect(res.status).toBe(200);
    expect(res.body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('concurrent requests with different tenant IDs are isolated', async () => {
    const tenantA = '01234567-0000-7000-8000-000000000003';
    const tenantB = '01234567-0000-7000-8000-000000000004';

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer()).get('/test-tenant').set('X-Tenant-ID', tenantA),
      request(app.getHttpServer()).get('/test-tenant').set('X-Tenant-ID', tenantB),
    ]);

    expect(resA.body.tenantId).toBe(tenantA);
    expect(resB.body.tenantId).toBe(tenantB);
  });
});
