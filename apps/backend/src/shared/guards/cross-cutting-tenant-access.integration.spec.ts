import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { BillingErrorCode } from '@ikaro/types';
import { InternalBillingAccessController } from '../../contexts/billing/infrastructure/controllers/internal-billing-access.controller';
import { CronBookingController } from '../../contexts/booking/infrastructure/controllers/cron-booking.controller';
import { GetTenantByIdUseCase } from '../../contexts/platform/application/use-cases/get-tenant-by-id.use-case';
import { GetTenantBySlugUseCase } from '../../contexts/platform/application/use-cases/get-tenant-by-slug.use-case';
import { GetTenantsUseCase } from '../../contexts/platform/application/use-cases/get-tenants.use-case';
import { ListPublishedHotsitesUseCase } from '../../contexts/platform/application/use-cases/list-published-hotsites.use-case';
import { InternalTenantReadController } from '../../contexts/platform/infrastructure/controllers/internal-tenant-read.controller';
import { HealthController } from '../../health/health.controller';
import { InMemoryTenantAccessPort } from '../../test/infrastructure/in-memory-tenant-access.port';
import { testConfigModule } from '../../test/utils/test-config-module';
import { ErrorFilter } from '../filters/error.filter';
import { PubSubPushController } from '../infrastructure/event-bus/pubsub-push.controller';
import { OutboxRelayController } from '../infrastructure/outbox/outbox-relay.controller';
import { PUSHABLE_EVENT_BUS } from '../ports/pushable-event-bus.port';
import { TENANT_ACCESS_PORT } from '../ports/tenant-access.port';
import { ITriggerBus, TRIGGER_BUS } from '../ports/trigger-bus.port';
import { CorrelationMiddleware } from '../request/correlation.middleware';
import { InternalApiGuard } from './internal-api.guard';
import { PubSubPushGuard } from './pubsub-push.guard';
import { TenantAccessGuard } from './tenant-access.guard';

const INTERNAL_KEY = 'integ-cross-cutting-key-integ-cross-cutting-key';
const SUSPENDED_TENANT = '0190d6a0-0000-7000-8000-0000000000c1';
const OTHER_TENANT = '0190d6a0-0000-7000-8000-0000000000c2';
const EXEMPT_TENANT = '0190d6a0-0000-7000-8000-0000000000c3';

class RecordingTriggerBus implements ITriggerBus {
  readonly published: string[] = [];
  registerTrigger(): void {}
  async publishTrigger(name: string): Promise<void> {
    this.published.push(name);
  }
}

class RecordingPushBus {
  readonly dispatched: string[] = [];
  async dispatchPushMessage(subscription: string): Promise<void> {
    this.dispatched.push(subscription);
  }
}

const TENANT_ITEM = {
  id: SUSPENDED_TENANT,
  slug: 'suspended-co',
  name: 'Suspended Co',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  isActive: true,
};

// M25-S20 — the real production guard chain (InternalApiGuard → TenantAccessGuard → ErrorFilter)
// over the real cross-cutting controllers: a suspended tenant keeps the routes the web needs to
// say so, and the machine routes (cron, Pub/Sub push, outbox relay, health) never see a tenant.
describe('Cross-cutting routes — tenant access (integration, M25-S20)', () => {
  let app: INestApplication;
  let port: InMemoryTenantAccessPort;
  let triggers: RecordingTriggerBus;
  let pushBus: RecordingPushBus;

  beforeAll(async () => {
    process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
    process.env['APP_ENV'] = 'local';
    port = new InMemoryTenantAccessPort();
    triggers = new RecordingTriggerBus();
    pushBus = new RecordingPushBus();
    port.seedSuspended(SUSPENDED_TENANT);
    port.seed(EXEMPT_TENANT, {
      status: 'ACTIVE',
      suspensionReason: null,
      operational: true,
      features: [],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [testConfigModule()],
      controllers: [
        InternalBillingAccessController,
        InternalTenantReadController,
        CronBookingController,
        OutboxRelayController,
        PubSubPushController,
        HealthController,
      ],
      providers: [
        { provide: TENANT_ACCESS_PORT, useValue: port },
        { provide: TRIGGER_BUS, useValue: triggers },
        { provide: PUSHABLE_EVENT_BUS, useValue: pushBus },
        { provide: HealthCheckService, useValue: { check: async () => ({ status: 'ok' }) } },
        { provide: TypeOrmHealthIndicator, useValue: {} },
        { provide: GetTenantByIdUseCase, useValue: { execute: async () => TENANT_ITEM } },
        { provide: GetTenantBySlugUseCase, useValue: { execute: async () => TENANT_ITEM } },
        {
          provide: GetTenantsUseCase,
          useValue: { execute: async () => ({ items: [TENANT_ITEM] }) },
        },
        {
          provide: ListPublishedHotsitesUseCase,
          useValue: { execute: async () => ({ items: [] }) },
        },
        { provide: APP_FILTER, useClass: ErrorFilter },
        { provide: APP_GUARD, useClass: InternalApiGuard },
        { provide: APP_GUARD, useClass: TenantAccessGuard },
      ],
    })
      // Pub/Sub push authenticates with an OIDC token outside `local`; this spec is about the
      // tenant gate, so the push guard is replaced.
      .overrideGuard(PubSubPushGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    const correlationMiddleware = new CorrelationMiddleware();
    app.use((req: Request, res: Response, next: NextFunction) =>
      correlationMiddleware.use(req, res, next),
    );
    await app.init();
  });

  beforeEach(() => {
    port.getAccessCalls.length = 0;
    triggers.published.length = 0;
    pushBus.dispatched.length = 0;
  });

  afterAll(async () => {
    await app.close();
    delete process.env['INTERNAL_API_KEY'];
    delete process.env['APP_ENV'];
  });

  const internal = (
    method: 'get' | 'post',
    path: string,
    headers: { tenantId?: string; role?: string } = {},
  ) => {
    const req = request(app.getHttpServer())[method](path).set('X-Internal-Key', INTERNAL_KEY);
    if (headers.tenantId) req.set('X-Tenant-ID', headers.tenantId);
    if (headers.role) req.set('X-Actor-Role', headers.role);
    return req;
  };

  describe('a suspended tenant', () => {
    it.each(['CUSTOMER', 'STAFF', 'MANAGER'])(
      'still gets the access read answered for its own X-Tenant-ID as %s',
      async (role) => {
        const res = await internal('get', `/internal/billing/tenants/${SUSPENDED_TENANT}/access`, {
          tenantId: SUSPENDED_TENANT,
          role,
        });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ operational: false });
      },
    );

    it.each(['CUSTOMER', 'STAFF', 'MANAGER'])(
      'still gets GET /internal/tenants?ids= answered for its own X-Tenant-ID as %s',
      async (role) => {
        const res = await internal('get', `/internal/tenants?ids=${SUSPENDED_TENANT}`, {
          tenantId: SUSPENDED_TENANT,
          role,
        });

        expect(res.status).toBe(200);
        expect(res.body).toEqual([TENANT_ITEM]);
      },
    );

    it('still resolves a tenant by id and by slug (the tenant switch and login reads)', async () => {
      const byId = await internal('get', `/internal/tenants/${SUSPENDED_TENANT}`, {
        tenantId: SUSPENDED_TENANT,
        role: 'CUSTOMER',
      });
      const bySlug = await internal('get', '/internal/tenants/by-slug/suspended-co');

      expect(byId.status).toBe(200);
      expect(bySlug.status).toBe(200);
    });

    it('refuses a tenant header with no role: ANY_AUTHENTICATED needs a role', async () => {
      const res = await internal('get', `/internal/tenants?ids=${SUSPENDED_TENANT}`, {
        tenantId: SUSPENDED_TENANT,
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(BillingErrorCode.TENANT_SUSPENDED);
    });
  });

  describe('machine routes carry no tenant', () => {
    it('runs a cron trigger, the outbox relay and a Pub/Sub push with no tenant context', async () => {
      const cron = await internal('post', '/cron/reminders');
      const relay = await internal('post', '/cron/outbox-relay');
      const push = await request(app.getHttpServer())
        .post('/pubsub/push')
        .send({ subscription: 'projects/p/subscriptions/s', message: { data: 'e30=' } });

      expect(cron.status).toBe(200);
      expect(relay.status).toBe(200);
      expect(push.status).toBe(204);
      expect(triggers.published).toHaveLength(2);
      expect(pushBus.dispatched).toEqual(['projects/p/subscriptions/s']);
      expect(port.getAccessCalls).toEqual([]);
    });

    it('answers health with no key and no tenant', async () => {
      const live = await request(app.getHttpServer()).get('/health/live');
      const ready = await request(app.getHttpServer()).get('/health/ready');

      expect(live.status).toBe(200);
      expect(ready.status).toBe(200);
      expect(port.getAccessCalls).toEqual([]);
    });
  });

  describe('an exempt tenant behaves exactly as before', () => {
    it('gets every cross-cutting route answered normally with no billing denial', async () => {
      const headers = { tenantId: EXEMPT_TENANT, role: 'MANAGER' };
      const responses = await Promise.all([
        internal('get', `/internal/billing/tenants/${EXEMPT_TENANT}/access`, headers),
        internal('get', `/internal/tenants?ids=${EXEMPT_TENANT}`, headers),
        internal('post', '/cron/reminders', headers),
      ]);

      expect(responses.map((res) => res.status)).toEqual([200, 200, 200]);
    });
  });

  describe('tenant isolation', () => {
    it('leaves a tenant that is not suspended unaffected while another is', async () => {
      const operational = await internal(
        'get',
        `/internal/billing/tenants/${OTHER_TENANT}/access`,
        { tenantId: OTHER_TENANT, role: 'MANAGER' },
      );
      const suspendedNoRole = await internal('get', `/internal/tenants?ids=${OTHER_TENANT}`, {
        tenantId: SUSPENDED_TENANT,
      });

      expect(operational.status).toBe(200);
      expect(operational.body).toMatchObject({ operational: true });
      expect(suspendedNoRole.status).toBe(403);
    });
  });
});
