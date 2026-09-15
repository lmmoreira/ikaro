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

    // M22-S02: a newly created service's bookingPolicy.defaultApprovalMode is never set — it
    // resolves from the real tenant's settings.booking.autoApproveEnabled (default false on a
    // freshly provisioned tenant) through the real BookingPlatformAdapter/TypeORM stack, not the
    // InMemory doubles the unit tests use.
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
    it('publishes the first version, retrievable via GET /services/:id round-trip on requiresPickupAddress', async () => {
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
              fieldKey: 'pickup',
              label: 'Endereço de coleta',
              type: 'PICKUP_ADDRESS',
              required: true,
            },
          ],
          consentText: 'Concordo com os termos',
        })
        .expect(201);
      expect(published.version).toBe(1);

      const { body: fetched } = await request(app.getHttpServer())
        .get(`/services/${created.id}`)
        .set(actorHeaders(isolatedTenant, MANAGER_ID))
        .expect(200);
      expect(fetched.requiresPickupAddress).toBe(true);
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
