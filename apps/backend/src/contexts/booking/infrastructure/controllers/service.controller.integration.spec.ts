import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ServiceEntityBuilder } from '../../../../test/builders/booking/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { PlatformModule } from '../../../platform/platform.module';
import { ServiceEntity } from '../entities/service.entity';
import { ServiceBookingIntakeSchemaEntity } from '../entities/service-booking-intake-schema.entity';

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
      .set('X-Platform-Admin-Key', TEST_KEY)
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

    it('accepts isActive=false when creating a draft service', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send({ ...validBody, isActive: false })
        .expect(201);

      expect(body.isActive).toBe(false);
    });

    it('returns 403 when CUSTOMER role is used', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantA, MANAGER_ID, 'CUSTOMER'))
        .send(validBody)
        .expect(403);
      expect(body.status).toBe(403);
    });

    it('resolves defaultApprovalMode from the real tenant autoApproveEnabled setting (default false)', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      expect(created.bookingPolicy.defaultApprovalMode).toBe('MANUAL_APPROVAL');

      const { body: fetched } = await request(app.getHttpServer())
        .get(`/services/${created.id}`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);

      expect(fetched.bookingPolicy.defaultApprovalMode).toBe('MANUAL_APPROVAL');
    });

    it('resolves defaultApprovalMode to AUTO_CONFIRM once the tenant enables autoApproveEnabled', async () => {
      const isolatedTenant = await provisionTenant();
      await request(app.getHttpServer())
        .patch('/tenants/settings')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({ settings: { booking: { autoApproveEnabled: true } } })
        .expect(200);

      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      expect(created.bookingPolicy.defaultApprovalMode).toBe('AUTO_CONFIRM');

      const { body: fetched } = await request(app.getHttpServer())
        .get(`/services/${created.id}`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);

      expect(fetched.bookingPolicy.defaultApprovalMode).toBe('AUTO_CONFIRM');
    });

    it('re-resolves defaultApprovalMode on every read as the tenant setting changes, never caching it on the service row', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);
      expect(created.bookingPolicy.defaultApprovalMode).toBe('MANUAL_APPROVAL');

      await request(app.getHttpServer())
        .patch('/tenants/settings')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({ settings: { booking: { autoApproveEnabled: true } } })
        .expect(200);

      const { body: fetched } = await request(app.getHttpServer())
        .get(`/services/${created.id}`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);

      expect(fetched.bookingPolicy.defaultApprovalMode).toBe('AUTO_CONFIRM');
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
    it('STAFF/MANAGER: returns active and inactive services for the tenant', async () => {
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
      expect(body.items.some((i: { name: string }) => i.name === 'Inativo')).toBe(true);
    });

    it('no actor role (public/guest): returns only active services', async () => {
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
        .set({ 'x-tenant-id': isolatedTenant, 'x-correlation-id': 'test-correlation-id' })
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

  // ─── PATCH /services/:id/resource-requirements ──────────────────────────────

  describe('PATCH /services/:id/resource-requirements', () => {
    it('persists the requirement + pool rows and is retrievable via GET /services/:id', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: resource } = await request(app.getHttpServer())
        .post('/resources')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({ type: 'EQUIPMENT', name: 'Máquina 1' })
        .expect(201);
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/services/${created.id}/resource-requirements`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({
          resourceRequirements: [
            { type: 'EQUIPMENT', selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds: [resource.id] },
          ],
        })
        .expect(200);

      const { body: fetched } = await request(app.getHttpServer())
        .get(`/services/${created.id}`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);

      expect(fetched.resourceRequirements).toHaveLength(1);
      expect(fetched.resourceRequirements[0].type).toBe('EQUIPMENT');
      expect(fetched.resourceRequirements[0].resourcePoolIds).toEqual([resource.id]);
    });

    it('returns 422 when the type has no active resources (UC-050 A1)', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/services/${created.id}/resource-requirements`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({ resourceRequirements: [{ type: 'EQUIPMENT', selectionMode: 'AUTO_ANY' }] })
        .expect(422);
      expect(body.status).toBe(422);
    });

    it('tenant isolation: a resourcePoolIds entry belonging to another tenant is rejected, never silently accepted', async () => {
      const isolatedTenant = await provisionTenant();
      const otherTenant = await provisionTenant();
      // Only tenant B has an active EQUIPMENT resource — tenant A must not treat that type as available.
      await request(app.getHttpServer())
        .post('/resources')
        .set(actorHeaders(otherTenant, MANAGER_ID))
        .send({ type: 'EQUIPMENT', name: 'Máquina Outro Tenant' })
        .expect(201);
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/services/${created.id}/resource-requirements`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({ resourceRequirements: [{ type: 'EQUIPMENT', selectionMode: 'CUSTOMER_CHOICE' }] })
        .expect(422);
      expect(body.status).toBe(422);
    });

    it('returns 404 for a cross-tenant service id', async () => {
      const entity = new ServiceEntityBuilder().withTenantId(tenantB).withIsActive(true).build();
      await ds.getRepository(ServiceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/services/${entity.id}/resource-requirements`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send({ resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }] })
        .expect(404);
      expect(body.status).toBe(404);
    });
  });

  // ─── PUT /services/:id/legs ──────────────────────────────────────────────────

  describe('PUT /services/:id/legs', () => {
    it('persists ordered legs with their own nested resource requirements', async () => {
      const isolatedTenant = await provisionTenant();
      await request(app.getHttpServer())
        .post('/resources')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({ type: 'ROOM', name: 'Sala 1' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/resources')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({ type: 'EQUIPMENT', name: 'Máquina 1' })
        .expect(201);
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .put(`/services/${created.id}/legs`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({
          legs: [
            {
              legIndex: 0,
              name: 'Sauna',
              durationMinutes: 20,
              resourceRequirements: [{ type: 'ROOM', selectionMode: 'AUTO_ANY' }],
              transitionGapAfterMinutes: 10,
            },
            {
              legIndex: 1,
              name: 'Massagem',
              durationMinutes: 50,
              resourceRequirements: [{ type: 'EQUIPMENT', selectionMode: 'CUSTOMER_CHOICE' }],
            },
          ],
        })
        .expect(200);

      expect(body.legs).toHaveLength(2);
      expect(body.totalSpanMinutes).toBe(80);

      const { body: fetched } = await request(app.getHttpServer())
        .get(`/services/${created.id}`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);
      expect(fetched.legs).toHaveLength(2);
      expect(fetched.resourceRequirements).toEqual([]);
      // The span is the service's persisted duration, and a later Details edit cannot move it.
      expect(fetched.durationMinutes).toBe(80);

      const { body: renamed } = await request(app.getHttpServer())
        .patch(`/services/${created.id}`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({ name: 'Jornada Renomeada', durationMinutes: 999 })
        .expect(200);
      expect(renamed.name).toBe('Jornada Renomeada');
      expect(renamed.durationMinutes).toBe(80);
    });

    it('returns 422 for fewer than 2 legs (UC-052 A1)', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .put(`/services/${created.id}/legs`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({
          legs: [
            {
              legIndex: 0,
              name: 'Única',
              durationMinutes: 30,
              resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
            },
          ],
        })
        .expect(422);
      expect(body.status).toBe(422);
    });

    it('returns 404 for a cross-tenant service id', async () => {
      const entity = new ServiceEntityBuilder().withTenantId(tenantB).withIsActive(true).build();
      await ds.getRepository(ServiceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .put(`/services/${entity.id}/legs`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send({
          legs: [
            {
              legIndex: 0,
              name: 'A',
              durationMinutes: 20,
              resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
            },
            {
              legIndex: 1,
              name: 'B',
              durationMinutes: 20,
              resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }],
            },
          ],
        })
        .expect(404);
      expect(body.status).toBe(404);
    });
  });

  // ─── PATCH /services/:id/booking-policy ─────────────────────────────────────

  describe('PATCH /services/:id/booking-policy', () => {
    it('persists all fields and round-trips via GET /services/:id', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/services/${created.id}/booking-policy`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({
          defaultApprovalMode: 'MANUAL_APPROVAL',
          manualHoldMinutes: 30,
          cancellationWindowHoursOverride: 24,
          rescheduleWindowHoursOverride: 24,
          minBookingAdvanceHoursOverride: 2,
          maxBookingAdvanceDaysOverride: 30,
          recurrenceEligible: true,
          availabilityAlertEligible: true,
          durationPolicy: 'CUSTOMER_SELECTED',
          durationMinMinutes: 30,
          durationMaxMinutes: 120,
          durationIncrementMinutes: 15,
          pricingPolicy: 'PER_TIME_INCREMENT',
          pricingIncrementMinutes: 15,
          pricePerIncrementAmount: 20,
          minimumChargeAmount: 40,
        })
        .expect(200);

      const { body: fetched } = await request(app.getHttpServer())
        .get(`/services/${created.id}`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);

      expect(fetched.bookingPolicy).toEqual({
        defaultApprovalMode: 'MANUAL_APPROVAL',
        manualHoldMinutes: 30,
        cancellationWindowHoursOverride: 24,
        rescheduleWindowHoursOverride: 24,
        minBookingAdvanceHoursOverride: 2,
        maxBookingAdvanceDaysOverride: 30,
        recurrenceEligible: true,
        recurringHorizonDays: null,
        availabilityAlertEligible: true,
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 30,
        durationMaxMinutes: 120,
        durationIncrementMinutes: 15,
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 15,
        pricePerIncrementAmount: 20,
        minimumChargeAmount: 40,
      });
    });

    it('returns 422 when durationPolicy=CUSTOMER_SELECTED without a non-FIXED pricingPolicy (UC-055 A2)', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/services/${created.id}/booking-policy`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({ durationPolicy: 'CUSTOMER_SELECTED' })
        .expect(422);
      expect(body.status).toBe(422);
    });

    it('returns 404 for a cross-tenant service id', async () => {
      const entity = new ServiceEntityBuilder().withTenantId(tenantB).withIsActive(true).build();
      await ds.getRepository(ServiceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/services/${entity.id}/booking-policy`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send({ recurrenceEligible: true })
        .expect(404);
      expect(body.status).toBe(404);
    });
  });

  // ─── POST /services/:id/intake-schema ───────────────────────────────────────

  describe('POST /services/:id/intake-schema', () => {
    it('publishes the first version with a BOOLEAN question', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body: published } = await request(app.getHttpServer())
        .post(`/services/${created.id}/intake-schema`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({
          questions: [
            {
              fieldKey: 'hasPet',
              label: 'Possui animal de estimação?',
              type: 'BOOLEAN',
              required: true,
            },
          ],
          consentText: 'Concordo com os termos',
        })
        .expect(201);
      expect(published.version).toBe(1);
    });

    it('publishing twice deactivates the first version; both remain queryable by version', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body: first } = await request(app.getHttpServer())
        .post(`/services/${created.id}/intake-schema`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({
          questions: [
            {
              fieldKey: 'accessNeeds',
              label: 'Necessidades de acesso',
              type: 'FREE_TEXT',
              required: false,
            },
          ],
          consentText: 'v1',
        })
        .expect(201);

      const { body: second } = await request(app.getHttpServer())
        .post(`/services/${created.id}/intake-schema`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({
          questions: [
            { fieldKey: 'other', label: 'Outra pergunta', type: 'FREE_TEXT', required: false },
          ],
          consentText: 'v2',
        })
        .expect(201);

      expect(first.version).toBe(1);
      expect(second.version).toBe(2);

      const rows = await ds
        .getRepository(ServiceBookingIntakeSchemaEntity)
        .find({ where: { tenantId: isolatedTenant, serviceId: created.id } });
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.version === 1)?.isActive).toBe(false);
      expect(rows.find((r) => r.version === 2)?.isActive).toBe(true);
    });

    it('returns 404 for a cross-tenant service id', async () => {
      const entity = new ServiceEntityBuilder().withTenantId(tenantB).withIsActive(true).build();
      await ds.getRepository(ServiceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .post(`/services/${entity.id}/intake-schema`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send({
          questions: [{ fieldKey: 'q', label: 'Q', type: 'FREE_TEXT', required: false }],
          consentText: 'Concordo',
        })
        .expect(404);
      expect(body.status).toBe(404);
    });
  });

  // ─── GET /services/:id/intake-schema ────────────────────────────────────────

  describe('GET /services/:id/intake-schema', () => {
    it('returns active: null and an empty history before anything is published', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${created.id}/intake-schema`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);

      expect(body.active).toBeNull();
      expect(body.history).toEqual([]);
    });

    it('returns the active version and prior versions in history after 2 publishes', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/services/${created.id}/intake-schema`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({
          questions: [
            {
              fieldKey: 'accessNeeds',
              label: 'Necessidades de acesso',
              type: 'FREE_TEXT',
              required: false,
            },
          ],
          consentText: 'v1',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/services/${created.id}/intake-schema`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({
          questions: [
            { fieldKey: 'other', label: 'Outra pergunta', type: 'FREE_TEXT', required: false },
          ],
          consentText: 'v2',
        })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${created.id}/intake-schema`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);

      expect(body.active.version).toBe(2);
      expect(body.active.consentText).toBe('v2');
      expect(body.history).toHaveLength(1);
      expect(body.history[0].version).toBe(1);
    });

    it('returns 404 for a cross-tenant service id', async () => {
      const entity = new ServiceEntityBuilder().withTenantId(tenantB).withIsActive(true).build();
      await ds.getRepository(ServiceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${entity.id}/intake-schema`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .expect(404);
      expect(body.status).toBe(404);
    });
  });

  // ─── GET /services/:id/intake-schema/public (M23-S02, UC-068) ───────────────

  describe('GET /services/:id/intake-schema/public', () => {
    it('requires no actor headers — active: null and no history key before anything is published', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${created.id}/intake-schema/public`)
        .set({ 'x-tenant-id': isolatedTenant, 'x-correlation-id': 'test-correlation-id' })
        .expect(200);

      expect(body.active).toBeNull();
      expect(body).not.toHaveProperty('history');
    });

    it('returns the active version only, never history, after a publish', async () => {
      const isolatedTenant = await provisionTenant();
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send(validBody)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/services/${created.id}/intake-schema`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .send({
          questions: [
            {
              fieldKey: 'accessNeeds',
              label: 'Necessidades de acesso',
              type: 'FREE_TEXT',
              required: false,
            },
          ],
          consentText: 'v1',
        })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${created.id}/intake-schema/public`)
        .set({ 'x-tenant-id': isolatedTenant, 'x-correlation-id': 'test-correlation-id' })
        .expect(200);

      expect(body.active.version).toBe(1);
      expect(body).not.toHaveProperty('history');
    });

    it('returns 404 for a cross-tenant service id', async () => {
      const entity = new ServiceEntityBuilder().withTenantId(tenantB).withIsActive(true).build();
      await ds.getRepository(ServiceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${entity.id}/intake-schema/public`)
        .set({ 'x-tenant-id': tenantA, 'x-correlation-id': 'test-correlation-id' })
        .expect(404);
      expect(body.status).toBe(404);
    });
  });

  // ─── GET /services/:id/resource-options + /quote (M23-S29) ─────────────────

  describe('GET /services/:id/resource-options and /quote (M23-S29)', () => {
    const guest = (tenantId: string) => ({
      'x-tenant-id': tenantId,
      'x-correlation-id': 'test-correlation-id',
    });

    async function createResource(tenantId: string, type: string, name: string): Promise<string> {
      const { body } = await request(app.getHttpServer())
        .post('/resources')
        .set(actorHeaders(tenantId, MANAGER_ID))
        .send({ type, name })
        .expect(201);
      return body.id as string;
    }

    async function createService(tenantId: string): Promise<string> {
      const { body } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantId, MANAGER_ID))
        .send(validBody)
        .expect(201);
      return body.id as string;
    }

    it('resource-options: a bundle service returns only its CUSTOMER_CHOICE requirement, id and name only, without actor headers', async () => {
      const tenant = await provisionTenant();
      const roomId = await createResource(tenant, 'ROOM', 'Sala 1');
      await createResource(tenant, 'EQUIPMENT', 'Máquina 1');
      const serviceId = await createService(tenant);
      await request(app.getHttpServer())
        .patch(`/services/${serviceId}/resource-requirements`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .send({
          resourceRequirements: [
            { type: 'ROOM', selectionMode: 'CUSTOMER_CHOICE' },
            { type: 'EQUIPMENT', selectionMode: 'AUTO_ANY' },
          ],
        })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${serviceId}/resource-options`)
        .set(guest(tenant))
        .expect(200);

      expect(body).toEqual({
        requirements: [
          {
            serviceId,
            legIndex: null,
            resourceType: 'ROOM',
            selectionMode: 'CUSTOMER_CHOICE',
            requiredQuantity: 1,
            options: [{ resourceId: roomId, name: 'Sala 1' }],
          },
        ],
      });
    });

    it('resource-options: a legged service returns per-leg entries', async () => {
      const tenant = await provisionTenant();
      await createResource(tenant, 'ROOM', 'Sala 1');
      await createResource(tenant, 'EQUIPMENT', 'Máquina 1');
      const serviceId = await createService(tenant);
      await request(app.getHttpServer())
        .put(`/services/${serviceId}/legs`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .send({
          legs: [
            {
              legIndex: 0,
              name: 'Sauna',
              durationMinutes: 20,
              resourceRequirements: [{ type: 'ROOM', selectionMode: 'CUSTOMER_CHOICE' }],
            },
            {
              legIndex: 1,
              name: 'Massagem',
              durationMinutes: 50,
              resourceRequirements: [{ type: 'EQUIPMENT', selectionMode: 'CUSTOMER_CHOICE' }],
            },
          ],
        })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${serviceId}/resource-options`)
        .set(guest(tenant))
        .expect(200);

      expect(body.requirements.map((r: { legIndex: number }) => r.legIndex)).toEqual([0, 1]);
    });

    it('resource-options: an inactive service returns 404', async () => {
      const tenant = await provisionTenant();
      const serviceId = await createService(tenant);
      await request(app.getHttpServer())
        .delete(`/services/${serviceId}`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${serviceId}/resource-options`)
        .set(guest(tenant))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('tenant isolation: resource-options and quote return 404 for a service of another tenant', async () => {
      const entity = new ServiceEntityBuilder().withTenantId(tenantB).withIsActive(true).build();
      await ds.getRepository(ServiceEntity).save(entity);

      const options = await request(app.getHttpServer())
        .get(`/services/${entity.id}/resource-options`)
        .set(guest(tenantA))
        .expect(404);
      const quote = await request(app.getHttpServer())
        .get(`/services/${entity.id}/quote?durationMinutes=60`)
        .set(guest(tenantA))
        .expect(404);

      expect(options.body.status).toBe(404);
      expect(quote.body.status).toBe(404);
    });

    it('tenant isolation: resource options never include another tenant’s resources', async () => {
      const tenant = await provisionTenant();
      const otherTenant = await provisionTenant();
      await createResource(otherTenant, 'ROOM', 'Sala do outro tenant');
      const ownRoom = await createResource(tenant, 'ROOM', 'Sala própria');
      const serviceId = await createService(tenant);
      await request(app.getHttpServer())
        .patch(`/services/${serviceId}/resource-requirements`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .send({ resourceRequirements: [{ type: 'ROOM', selectionMode: 'CUSTOMER_CHOICE' }] })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${serviceId}/resource-options`)
        .set(guest(tenant))
        .expect(200);

      expect(body.requirements[0].options).toEqual([{ resourceId: ownRoom, name: 'Sala própria' }]);
    });

    it('quote: prices a per-time service and returns 422 for an out-of-range duration', async () => {
      const tenant = await provisionTenant();
      const serviceId = await createService(tenant);
      await request(app.getHttpServer())
        .patch(`/services/${serviceId}/booking-policy`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .send({
          durationPolicy: 'CUSTOMER_SELECTED',
          durationMinMinutes: 60,
          durationMaxMinutes: 240,
          durationIncrementMinutes: 30,
          pricingPolicy: 'PER_TIME_INCREMENT',
          pricingIncrementMinutes: 60,
          pricePerIncrementAmount: 50,
        })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${serviceId}/quote?durationMinutes=90`)
        .set(guest(tenant))
        .expect(200);
      expect(body).toEqual({ durationMinutes: 90, price: { amount: 100, currency: 'BRL' } });

      await request(app.getHttpServer())
        .get(`/services/${serviceId}/quote?durationMinutes=300`)
        .set(guest(tenant))
        .expect(422);
      await request(app.getHttpServer())
        .get(`/services/${serviceId}/quote`)
        .set(guest(tenant))
        .expect(422);
      await request(app.getHttpServer())
        .get(`/services/${serviceId}/quote?durationMinutes=abc`)
        .set(guest(tenant))
        .expect(400);
    });

    it('quote: a FIXED service ignores durationMinutes and returns its own price and duration', async () => {
      const tenant = await provisionTenant();
      const serviceId = await createService(tenant);

      const { body } = await request(app.getHttpServer())
        .get(`/services/${serviceId}/quote?durationMinutes=999`)
        .set(guest(tenant))
        .expect(200);

      expect(body).toEqual({ durationMinutes: 60, price: { amount: 150, currency: 'BRL' } });
    });
  });

  // ─── Legs and a customer-selected duration are mutually exclusive (M23-S29) ──

  describe('legs vs customer-selected duration', () => {
    const customDurationPolicy = {
      durationPolicy: 'CUSTOMER_SELECTED',
      durationMinMinutes: 30,
      durationMaxMinutes: 120,
      durationIncrementMinutes: 30,
      pricingPolicy: 'PER_TIME_INCREMENT',
      pricingIncrementMinutes: 30,
      pricePerIncrementAmount: 20,
    };
    const twoLegs = {
      legs: [
        {
          legIndex: 0,
          name: 'Sauna',
          durationMinutes: 20,
          resourceRequirements: [{ type: 'ROOM', selectionMode: 'AUTO_ANY' }],
        },
        {
          legIndex: 1,
          name: 'Massagem',
          durationMinutes: 50,
          resourceRequirements: [{ type: 'ROOM', selectionMode: 'AUTO_ANY' }],
        },
      ],
    };

    async function createServiceWithRoom(): Promise<{ tenant: string; serviceId: string }> {
      const tenant = await provisionTenant();
      await request(app.getHttpServer())
        .post('/resources')
        .set(actorHeaders(tenant, MANAGER_ID))
        .send({ type: 'ROOM', name: 'Sala 1' })
        .expect(201);
      const { body } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenant, MANAGER_ID))
        .send(validBody)
        .expect(201);
      return { tenant, serviceId: body.id as string };
    }

    it('rejects a customer-selected duration on a service that already has legs with 409', async () => {
      const { tenant, serviceId } = await createServiceWithRoom();
      await request(app.getHttpServer())
        .put(`/services/${serviceId}/legs`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .send(twoLegs)
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/services/${serviceId}/booking-policy`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .send(customDurationPolicy)
        .expect(409);

      expect(body.code).toBe('BOOKING_SERVICE_LEGS_CUSTOM_DURATION_CONFLICT');
    });

    it('rejects legs on a service whose duration is customer-selected with 409', async () => {
      const { tenant, serviceId } = await createServiceWithRoom();
      await request(app.getHttpServer())
        .patch(`/services/${serviceId}/booking-policy`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .send(customDurationPolicy)
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .put(`/services/${serviceId}/legs`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .send(twoLegs)
        .expect(409);

      expect(body.code).toBe('BOOKING_SERVICE_LEGS_CUSTOM_DURATION_CONFLICT');
    });

    it('still lets a legged service change its other booking-policy fields', async () => {
      const { tenant, serviceId } = await createServiceWithRoom();
      await request(app.getHttpServer())
        .put(`/services/${serviceId}/legs`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .send(twoLegs)
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/services/${serviceId}/booking-policy`)
        .set(actorHeaders(tenant, MANAGER_ID))
        .send({ defaultApprovalMode: 'MANUAL_APPROVAL', manualHoldMinutes: 30 })
        .expect(200);

      expect(body.bookingPolicy.defaultApprovalMode).toBe('MANUAL_APPROVAL');
    });
  });

  // ─── PATCH /services/:id/activate ───────────────────────────────────────────

  describe('PATCH /services/:id/activate', () => {
    it('reactivates a deactivated service', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/services')
        .set(actorHeaders(tenantA, MANAGER_ID))
        .send({ ...validBody, name: 'Para Reativar' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/services/${created.id}`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .expect(200);

      const { body: result } = await request(app.getHttpServer())
        .patch(`/services/${created.id}/activate`)
        .set(actorHeaders(tenantA, MANAGER_ID))
        .expect(200);

      expect(result.id).toBe(created.id);
      expect(result.isActive).toBe(true);

      const row = await ds.getRepository(ServiceEntity).findOne({ where: { id: created.id } });
      expect(row).not.toBeNull();
      expect(row!.isActive).toBe(true);
    });

    it('returns 404 for service belonging to a different tenant', async () => {
      const entity = new ServiceEntityBuilder().withTenantId(tenantB).withIsActive(false).build();
      await ds.getRepository(ServiceEntity).save(entity);

      const { body } = await request(app.getHttpServer())
        .patch(`/services/${entity.id}/activate`)
        .set(actorHeaders(tenantA, MANAGER_ID))
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

    it('deactivated service is excluded from the public list but still visible to STAFF/MANAGER', async () => {
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

      const { body: publicBody } = await request(app.getHttpServer())
        .get('/services')
        .set({ 'x-tenant-id': isolatedTenant, 'x-correlation-id': 'test-correlation-id' })
        .expect(200);
      expect(publicBody.items.every((i: { id: string }) => i.id !== created.id)).toBe(true);

      const { body: staffBody } = await request(app.getHttpServer())
        .get('/services')
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);
      const found = staffBody.items.find((i: { id: string }) => i.id === created.id);
      expect(found).toBeDefined();
      expect(found.isActive).toBe(false);
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
