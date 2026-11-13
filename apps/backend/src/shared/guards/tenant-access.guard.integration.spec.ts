import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { BillingErrorCode } from '@ikaro/types';
import { NoFeatureGate, RequiresFeature, SuspensionAccess } from '@ikaro/nestjs-http';
import { ErrorFilter } from '../filters/error.filter';
import { AppLogger } from '../observability/app-logger';
import { TENANT_ACCESS_PORT } from '../ports/tenant-access.port';
import { CorrelationMiddleware } from '../request/correlation.middleware';
import { InMemoryTenantAccessPort } from '../../test/infrastructure/in-memory-tenant-access.port';
import { testConfigModule } from '../../test/utils/test-config-module';
import { InternalApiGuard } from './internal-api.guard';
import { TenantAccessGuard } from './tenant-access.guard';

const INTERNAL_KEY = 'integ-tenant-access-key-integ-tenant-access-key';
const TENANT_A = '0190d6a0-0000-7000-8000-0000000000a1';
const TENANT_B = '0190d6a0-0000-7000-8000-0000000000b2';

@Controller('test-tenant-access')
class TestController {
  // Handler executions: a Guard-rejected request must never reach the controller.
  static chatbotExecutions = 0;

  @Get('chatbot')
  @RequiresFeature('CHATBOT')
  @SuspensionAccess('DEFAULT_DENY')
  chatbot(): { ok: true } {
    TestController.chatbotExecutions += 1;
    return { ok: true };
  }

  @Get('history')
  @NoFeatureGate()
  @SuspensionAccess('CUSTOMER_HISTORY')
  history(): { ok: true } {
    return { ok: true };
  }

  // A route nobody annotated: entitlement-allowed, suspension-denied.
  @Get('unannotated')
  unannotated(): { ok: true } {
    return { ok: true };
  }
}

// M25-S16 — the real production pipeline (InternalApiGuard → TenantAccessGuard → CorrelationMiddleware
// → ErrorFilter), assembled the way AppModule wires it, with a route annotated for a feature.
describe('TenantAccessGuard (integration — a real annotated route)', () => {
  let app: INestApplication;
  let port: InMemoryTenantAccessPort;
  let warn: jest.SpyInstance;

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    port = new InMemoryTenantAccessPort();

    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule()],
      controllers: [TestController],
      providers: [
        { provide: TENANT_ACCESS_PORT, useValue: port },
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: APP_GUARD, useClass: InternalApiGuard },
        { provide: APP_GUARD, useClass: TenantAccessGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    const correlationMiddleware = new CorrelationMiddleware();
    app.use((req: Request, res: Response, next: NextFunction) =>
      correlationMiddleware.use(req, res, next),
    );
    await app.init();
  });

  beforeEach(() => {
    port.getAccessCalls.length = 0;
    warn = jest.spyOn(AppLogger.prototype, 'warn');
  });

  afterEach(() => warn.mockRestore());

  afterAll(async () => {
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
  });

  const get = (path: string, tenantId?: string, role?: string) => {
    const req = request(app.getHttpServer()).get(`/test-tenant-access/${path}`);
    req.set('X-Internal-Key', INTERNAL_KEY);
    if (tenantId) req.set('X-Tenant-ID', tenantId);
    if (role) req.set('X-Actor-Role', role);
    return req;
  };

  it('allows an entitled tenant on the annotated route', async () => {
    const res = await get('chatbot', TENANT_A, 'MANAGER');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('denies a tenant without the feature with a Problem Details body and no leaked identifiers', async () => {
    port.seed(TENANT_B, {
      status: 'ACTIVE',
      suspensionReason: null,
      operational: true,
      features: [{ key: 'BOOKING', tier: 'STANDARD' }],
    });

    TestController.chatbotExecutions = 0;
    const res = await get('chatbot', TENANT_B, 'MANAGER');

    expect(res.status).toBe(403);
    // The guard rejected the request before the controller ran.
    expect(TestController.chatbotExecutions).toBe(0);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      status: 403,
      code: BillingErrorCode.FEATURE_NOT_ENTITLED,
    });
    expect(JSON.stringify(res.body)).not.toContain(TENANT_B);
    expect(JSON.stringify(res.body)).not.toMatch(/CHATBOT|subscription|BOOKING/);
  });

  it('denies a suspended tenant on a default-policy route and admits the policy role on an exceptional one', async () => {
    port.seedSuspended(TENANT_B);

    const denied = await get('unannotated', TENANT_B, 'MANAGER');
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe(BillingErrorCode.TENANT_SUSPENDED);

    const customer = await get('history', TENANT_B, 'CUSTOMER');
    expect(customer.status).toBe(200);
    const staff = await get('history', TENANT_B, 'STAFF');
    expect(staff.status).toBe(403);
    expect(staff.body.code).toBe(BillingErrorCode.TENANT_SUSPENDED);
  });

  it('a Guard-rejected request still produces a logged, traced error response', async () => {
    port.seedSuspended(TENANT_B);

    const res = await get('chatbot', TENANT_B, 'MANAGER');

    // Traced: the correlation id was stamped before the guard ran and rides the response.
    expect(res.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.correlationId).toBe(res.headers['x-correlation-id']);
    // Logged: the error filter ran for the rejection (an Interceptor never would have).
    expect(warn).toHaveBeenCalledWith(
      'Error response',
      expect.objectContaining({ code: BillingErrorCode.TENANT_SUSPENDED }),
    );
  });

  it("evaluates only the request's own tenant", async () => {
    port.seedSuspended(TENANT_B);

    const res = await get('chatbot', TENANT_A, 'MANAGER');

    expect(res.status).toBe(200);
    expect(port.getAccessCalls).toEqual([TENANT_A]);
  });

  it('passes a request with no X-Tenant-ID without consulting the port', async () => {
    const res = await get('unannotated');

    expect(res.status).toBe(200);
    expect(port.getAccessCalls).toEqual([]);
  });
});
