import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ServiceEntityBuilder } from '../../../../test/builders/booking/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { PlatformModule } from '../../../platform/platform.module';
import { ServiceEntity } from '../entities/service.entity';

const TEST_KEY = 'service-integ-test-key-service-xxxx'; // 36 chars
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

const validBody = {
  name: 'Lavagem Completa',
  description: 'Descrição completa',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
  requiresPickupAddress: false,
};

let tenantCounter = 0;

describe('ServiceController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantA: string;
  let tenantB: string;

  async function provisionTenant(): Promise<string> {
    tenantCounter += 1;
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({
        name: `Service Tenant ${tenantCounter}`,
        slug: `service-tenant-${tenantCounter}`,
        adminEmail: `tenant${tenantCounter}@service.test`,
        country_code: 'BR',
      })
      .expect(201);
    return body.tenantId as string;
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));
    tenantA = await provisionTenant();
    tenantB = await provisionTenant();
  });

  afterAll(async () => {
    await app.close();
    delete process.env['PLATFORM_ADMIN_KEY'];
  });

  // ─── POST /services ──────────────────────────────────────────────────────────

  describe('POST /services', () => {
    it('returns 201 with full service DTO including pt-BR formatted price', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send(validBody)
        .expect(201);

      expect(body.id).toBeDefined();
      expect(body.price.formatted).toBe('R$\u00A0150,00');
      expect(body.isActive).toBe(true);
    });

    it('returns 403 when CUSTOMER role is used', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantA, MANAGER_ID, 'CUSTOMER'))
        .send(validBody)
        .expect(403);
      expect(body.status).toBe(403);
    });

    it('returns 400 when priceAmount is zero', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send({ ...validBody, priceAmount: 0 })
        .expect(400);
      expect(body.status).toBe(400);
    });

    it('tenant isolation: created service only visible to owning tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const row = await ds
        .getRepository(ServiceEntity)
        .findOne({ where: { id: body.id, tenantId: tenantB } });
      expect(row).toBeNull();
    });
  });

  // ─── GET /services ───────────────────────────────────────────────────────────

  describe('GET /services', () => {
    it('returns only active services for the tenant', async () => {
      const isolatedTenant = await provisionTenant();
      const activeEntity = new ServiceEntityBuilder()
        .withTenantId(isolatedTenant)
        .withName('Ativo')
        .withIsActive(true)
        .build();
      const inactiveEntity = new ServiceEntityBuilder()
        .withTenantId(isolatedTenant)
        .withName('Inativo')
        .withIsActive(false)
        .build();
      await ds.getRepository(ServiceEntity).save(activeEntity);
      await ds.getRepository(ServiceEntity).save(inactiveEntity);

      const { body } = await request(app.getHttpServer())
        .get('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);

      expect(body.items.some((i: { name: string }) => i.name === 'Ativo')).toBe(true);
      expect(body.items.some((i: { name: string }) => i.name === 'Inativo')).toBe(false);
    });

    it('tenant isolation: services from Tenant A not visible to Tenant B', async () => {
      const entityA = new ServiceEntityBuilder()
        .withTenantId(tenantA)
        .withName('Serviço A')
        .withIsActive(true)
        .build();
      await ds.getRepository(ServiceEntity).save(entityA);

      const { body } = await request(app.getHttpServer())
        .get('/services')
        .set(actorHeaders(tenantB, MANAGER_ID))
        .expect(200);

      expect(body.items.every((i: { id: string }) => i.id !== entityA.id)).toBe(true);
    });

    it('returns 400 when X-Tenant-ID is missing', async () => {
      const { body } = await request(app.getHttpServer()).get('/services').expect(400);
      expect(body.status ?? body.statusCode).toBe(400);
    });
  });

  // ─── PATCH /services/:id ─────────────────────────────────────────────────────

  describe('PATCH /services/:id', () => {
    it('updates only provided fields; others remain unchanged', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body: updated } = await request(app.getHttpServer())
        .patch(`/services/${created.id}`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send({ name: 'Nome Atualizado' })
        .expect(200);

      expect(updated.name).toBe('Nome Atualizado');
      expect(updated.durationMinutes).toBe(60);
    });

    it('returns 409 when updating a deactivated service', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send(validBody)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/services/${created.id}`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/services/${created.id}`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send({ name: 'X' })
        .expect(409);
      expect(body.status).toBe(409);
    });

    it('returns 404 for service belonging to a different tenant', async () => {
      const entity = new ServiceEntityBuilder().withTenantId(tenantB).withIsActive(true).build();
      await ds.getRepository(ServiceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/services/${entity.id}`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send({ name: 'X' })
        .expect(404);
      expect(body.status).toBe(404);
    });
  });

  // ─── DELETE /services/:id ────────────────────────────────────────────────────

  describe('DELETE /services/:id', () => {
    it('sets isActive=false — row still exists in DB', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body: result } = await request(app.getHttpServer())
        .delete(`/services/${created.id}`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .expect(200);

      expect(result.id).toBe(created.id);
      expect(result.isActive).toBe(false);

      const row = await ds.getRepository(ServiceEntity).findOne({ where: { id: created.id } });
      expect(row).not.toBeNull();
      expect(row!.isActive).toBe(false);
    });

    it('deactivated service is excluded from GET /services list', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({ ...validBody, name: 'Para Desativar' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/services/${created.id}`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);

      expect(body.items.every((i: { id: string }) => i.id !== created.id)).toBe(true);
    });

    it('returns 404 for service belonging to a different tenant', async () => {
      const entity = new ServiceEntityBuilder().withTenantId(tenantB).withIsActive(true).build();
      await ds.getRepository(ServiceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .delete(`/services/${entity.id}`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .expect(404);
      expect(body.status).toBe(404);
    });
  });
});
