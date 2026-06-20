import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { InMemoryTenantSettingsPort } from '../../test/infrastructure/in-memory-tenant-settings.port';
import { TENANT_SETTINGS_PORT } from '../ports/tenant-settings.port';
import { RequestContext } from './request-context';
import { RequestInterceptor } from './request.interceptor';
import { RequestModule } from './request.module';

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
    const res = await request(app.getHttpServer())
      .get('/test-tenant')
      .set('X-Tenant-ID', tenantId)
      .set('X-Correlation-ID', 'corr-abc');

    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(tenantId);
    expect(res.body.correlationId).toBe('corr-abc');
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
