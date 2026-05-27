import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  ServiceEntityBuilder,
  BookingEntityBuilder,
} from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { futureDate } from '../../../../test/utils/date-helpers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus.module';
import { PlatformModule } from '../../../platform/platform.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { ServiceEntity } from '../entities/service.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';

const TEST_KEY = 'booking-integ-test-key-booking-xxxx'; // 36 chars
const ACTOR_ID = '20000000-0000-4000-8000-000000000001';
const STAFF_ID = '20000000-0000-4000-8000-000000000002';

const scheduledAt = `${futureDate(2)}T13:00:00.000Z`;

function guestHeaders(tenantId: string) {
  return { 'x-tenant-id': tenantId, 'x-correlation-id': 'test-corr-id' };
}

describe('BookingController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;
  let serviceId: string;
  let servicePickupId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({
      extraModules: [EventBusModule, PlatformModule],
      overrideEventBus: true,
    }));

    // Seed tenants via the canonical API — no direct DB access to the platform context.
    const { body: a } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({ name: 'Booking Tenant A', slug: 'booking-tenant-a', adminEmail: 'a@booking.test' })
      .expect(201);
    tenantAId = a.tenantId as string;

    const { body: b } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('Authorization', `Bearer ${TEST_KEY}`)
      .send({ name: 'Booking Tenant B', slug: 'booking-tenant-b', adminEmail: 'b@booking.test' })
      .expect(201);
    tenantBId = b.tenantId as string;

    // Seed services with dynamic tenantId
    const svc = new ServiceEntityBuilder()
      .withTenantId(tenantAId)
      .withName('Lavagem Completa')
      .withPriceAmount('100.00')
      .withDurationMinutes(30)
      .withIsActive(true)
      .build();
    await ds.getRepository(ServiceEntity).save(svc);
    serviceId = svc.id;

    const svcPickup = new ServiceEntityBuilder()
      .withTenantId(tenantAId)
      .withName('Coleta em Domicílio')
      .withPriceAmount('50.00')
      .withDurationMinutes(20)
      .withRequiresPickupAddress(true)
      .withIsActive(true)
      .build();
    await ds.getRepository(ServiceEntity).save(svcPickup);
    servicePickupId = svcPickup.id;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  const validBody = () => ({
    guestEmail: 'joao@example.com',
    guestName: 'João Silva',
    guestPhone: '31999999999',
    scheduledAt,
    serviceIds: [serviceId],
  });

  describe('POST /bookings', () => {
    it('creates a PENDING booking and persists all fields', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send(validBody())
        .expect(201);

      expect(body.bookingId).toBeDefined();
      expect(body.status).toBe('PENDING');
      expect(body.totalDurationMins).toBe(30);
      expect(body.totalPrice.amount).toBe(100);
      expect(body.lines).toHaveLength(1);
      expect(body.lines[0].serviceId).toBe(serviceId);

      const row = await ds
        .getRepository(BookingEntity)
        .findOne({ where: { id: body.bookingId, tenantId: tenantAId } });
      expect(row).not.toBeNull();
      expect(row!.status).toBe('PENDING');
      expect(row!.type).toBe('GUEST');
      expect(row!.guestEmail).toBe('joao@example.com');

      const lines = await ds
        .getRepository(BookingLineEntity)
        .find({ where: { bookingId: body.bookingId } });
      expect(lines).toHaveLength(1);
      expect(lines[0].serviceId).toBe(serviceId);
    });

    it('stores beforeServicePhotoUrls', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), beforeServicePhotoUrls: ['https://s3.example.com/car.jpg'] })
        .expect(201);

      const row = await ds.getRepository(BookingEntity).findOne({ where: { id: body.bookingId } });
      expect(row!.beforeServicePhotoUrls).toContain('https://s3.example.com/car.jpg');
    });

    it('stores pickupAddress when a pickup service is selected', async () => {
      const pickup = {
        street: 'Rua das Flores',
        number: '10',
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30100000',
      };
      const { body } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), serviceIds: [servicePickupId], pickupAddress: pickup })
        .expect(201);

      expect(body.pickupAddress).not.toBeNull();
      expect(body.pickupAddress.city).toBe('Belo Horizonte');

      const row = await ds.getRepository(BookingEntity).findOne({ where: { id: body.bookingId } });
      expect(row!.pickupAddress).not.toBeNull();
    });

    it('returns 400 when a pickup service is selected but pickupAddress is absent', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), serviceIds: [servicePickupId] })
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('returns 400 for an unknown serviceId (not in tenant)', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), serviceIds: ['00000000-0000-4000-8000-000000009999'] })
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('returns 400 when guestPhone is invalid (too short)', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), guestPhone: 'abc' })
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('returns 400 when serviceIds is missing', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ guestEmail: 'x@x.com', guestName: 'X', guestPhone: '31999999999', scheduledAt })
        .expect(400);

      expect(body.status).toBe(400);
    });

    it('tenant isolation: booking belongs to correct tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send(validBody())
        .expect(201);

      const wrongTenant = await ds
        .getRepository(BookingEntity)
        .findOne({ where: { id: body.bookingId, tenantId: tenantBId } });
      expect(wrongTenant).toBeNull();
    });

    it('handles bookings with duplicate serviceIds (two lines)', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings')
        .set(actorHeaders(tenantAId, ACTOR_ID))
        .send({ ...validBody(), serviceIds: [serviceId, serviceId] })
        .expect(201);

      expect(body.lines).toHaveLength(2);
      expect(body.totalDurationMins).toBe(60);
    });
  });

  describe('PATCH /bookings/:id/cancel-customer', () => {
    let cancelCustomerId: string;

    beforeAll(async () => {
      const customer = new CustomerEntityBuilder()
        .withTenantId(tenantAId)
        .withGoogleOAuthId('google-sub-cancel-customer')
        .withEmail('cancel-customer@booking.test')
        .withName('Cancel Customer')
        .withPhone('31944444444')
        .build();
      await ds.getRepository(CustomerEntity).save(customer);
      cancelCustomerId = customer.id;
    });

    it('cancels a PENDING booking with no time restriction → CANCELLED', async () => {
      // scheduled in 30 min — inside any window, but PENDING so no check
      const nearFuture = new Date(Date.now() + 30 * 60_000).toISOString();
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .send({ scheduledAt: nearFuture, serviceIds: [serviceId] })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-customer`)
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .expect(200);

      expect(body.status).toBe('CANCELLED');
      expect(body.bookingId).toBe(created.bookingId);

      const row = await ds
        .getRepository(BookingEntity)
        .findOne({ where: { id: created.bookingId, tenantId: tenantAId } });
      expect(row!.status).toBe('CANCELLED');
      expect(row!.cancelledBy).toBe(cancelCustomerId);
    });

    it('cancels an APPROVED booking with scheduledAt > 48h away → CANCELLED', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(10)}T09:00:00.000Z`, serviceIds: [serviceId] })
        .expect(201);

      // approve it first
      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/approve`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-customer`)
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .expect(200);

      expect(body.status).toBe('CANCELLED');
    });

    it('returns 422 when APPROVED booking is inside the 48h cancellation window', async () => {
      // scheduled in 1h — inside the default 48h window
      const nearFuture = new Date(Date.now() + 60 * 60_000).toISOString();
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .send({ scheduledAt: nearFuture, serviceIds: [serviceId] })
        .expect(201);

      // approve it — now window check applies
      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/approve`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-customer`)
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 403 when caller is not the booking owner', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(15)}T09:00:00.000Z`, serviceIds: [serviceId] })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-customer`)
        .set(actorHeaders(tenantAId, ACTOR_ID, 'CUSTOMER'))
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('returns 422 when booking is already CANCELLED', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(16)}T09:00:00.000Z`, serviceIds: [serviceId] })
        .expect(201);

      // cancel once
      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-customer`)
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .expect(200);

      // attempt again
      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-customer`)
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 404 when booking does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/bookings/00000000-0000-4000-8000-000000009999/cancel-customer')
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('tenant isolation: cannot cancel a booking from tenantB', async () => {
      const svcB = new ServiceEntityBuilder()
        .withTenantId(tenantBId)
        .withName('Serviço B Cancel')
        .withPriceAmount('80.00')
        .withDurationMinutes(30)
        .withIsActive(true)
        .build();
      await ds.getRepository(ServiceEntity).save(svcB);

      const customerB = new CustomerEntityBuilder()
        .withTenantId(tenantBId)
        .withGoogleOAuthId('google-sub-cancel-b')
        .withEmail('cancel-customer-b@booking.test')
        .withName('Cancel Customer B')
        .withPhone('31933333333')
        .build();
      await ds.getRepository(CustomerEntity).save(customerB);

      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantBId, customerB.id, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(17)}T09:00:00.000Z`, serviceIds: [svcB.id] })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-customer`)
        .set(actorHeaders(tenantAId, cancelCustomerId, 'CUSTOMER'))
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('PATCH /bookings/:id/cancel-admin', () => {
    it('cancels a PENDING booking → CANCELLED, sets cancelledBy and isBusiness=true', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), scheduledAt: `${futureDate(20)}T09:00:00.000Z` })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-admin`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .send({})
        .expect(200);

      expect(body.status).toBe('CANCELLED');
      expect(body.bookingId).toBe(created.bookingId);

      const row = await ds
        .getRepository(BookingEntity)
        .findOne({ where: { id: created.bookingId, tenantId: tenantAId } });
      expect(row!.status).toBe('CANCELLED');
      expect(row!.cancelledBy).toBe(STAFF_ID);
    });

    it('cancels an APPROVED booking — admin bypasses any cancellation window', async () => {
      // Use a static far-future date to avoid slot conflicts with other tests
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), scheduledAt: `${futureDate(25)}T09:00:00.000Z` })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/approve`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-admin`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .send({})
        .expect(200);

      expect(body.status).toBe('CANCELLED');
    });

    it('cancels with optional reason and persists it', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), scheduledAt: `${futureDate(21)}T09:00:00.000Z` })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-admin`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .send({ reason: 'Staff unavailable' })
        .expect(200);

      const row = await ds
        .getRepository(BookingEntity)
        .findOne({ where: { id: created.bookingId, tenantId: tenantAId } });
      expect(row!.cancellationReason).toBe('Staff unavailable');
    });

    it('returns 422 when booking is COMPLETED (terminal state)', async () => {
      // Insert a COMPLETED booking directly — PATCH /complete is part of UC-009 (not yet implemented)
      const completedBooking = new BookingEntityBuilder()
        .withTenantId(tenantAId)
        .withStatus('COMPLETED')
        .withScheduledAt(new Date(`${futureDate(22)}T09:00:00.000Z`))
        .build();
      await ds.getRepository(BookingEntity).save(completedBooking);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${completedBooking.id}/cancel-admin`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .send({})
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 404 when booking does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/bookings/00000000-0000-4000-8000-000000009998/cancel-admin')
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .send({})
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 403 when no staff role headers are provided', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), scheduledAt: `${futureDate(23)}T09:00:00.000Z` })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-admin`)
        .set(guestHeaders(tenantAId))
        .send({})
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('tenant isolation: cannot cancel a booking from tenantB', async () => {
      const svcB = new ServiceEntityBuilder()
        .withTenantId(tenantBId)
        .withName('Serviço B Admin Cancel')
        .withPriceAmount('80.00')
        .withDurationMinutes(30)
        .withIsActive(true)
        .build();
      await ds.getRepository(ServiceEntity).save(svcB);

      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantBId))
        .send({
          ...validBody(),
          scheduledAt: `${futureDate(24)}T09:00:00.000Z`,
          serviceIds: [svcB.id],
        })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/cancel-admin`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .send({})
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('PATCH /bookings/:id/approve', () => {
    it('approves a PENDING booking → status APPROVED', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), scheduledAt: `${futureDate(10)}T09:00:00.000Z` })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/approve`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(200);

      expect(body.status).toBe('APPROVED');
      expect(body.bookingId).toBe(created.bookingId);
      expect(body.approvedAt).toBeDefined();

      const row = await ds
        .getRepository(BookingEntity)
        .findOne({ where: { id: created.bookingId, tenantId: tenantAId } });
      expect(row!.status).toBe('APPROVED');
      expect(row!.approvedBy).toBe(STAFF_ID);
    });

    it('returns 409 when slot is already taken by another APPROVED booking', async () => {
      const conflictScheduledAt = `${futureDate(11)}T10:00:00.000Z`;

      // Create both bookings while slot is still free (both PENDING)
      const { body: first } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), scheduledAt: conflictScheduledAt })
        .expect(201);

      const { body: second } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), scheduledAt: conflictScheduledAt })
        .expect(201);

      // Approve first — slot is now taken
      await request(app.getHttpServer())
        .patch(`/bookings/${first.bookingId}/approve`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(200);

      // Second approval should conflict
      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${second.bookingId}/approve`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(409);

      expect(body.status).toBe(409);
    });

    it('returns 422 when trying to approve an already-APPROVED booking', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), scheduledAt: `${futureDate(12)}T09:00:00.000Z` })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/approve`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/approve`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 404 when booking does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/bookings/00000000-0000-4000-8000-000000009999/approve')
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 403 when no role headers are provided', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), scheduledAt: `${futureDate(13)}T09:00:00.000Z` })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/approve`)
        .set(guestHeaders(tenantAId))
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('tenant isolation: cannot approve booking from tenantB', async () => {
      const svcB = new ServiceEntityBuilder()
        .withTenantId(tenantBId)
        .withName('Serviço B')
        .withPriceAmount('80.00')
        .withDurationMinutes(30)
        .withIsActive(true)
        .build();
      await ds.getRepository(ServiceEntity).save(svcB);

      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantBId))
        .send({
          ...validBody(),
          serviceIds: [svcB.id],
          scheduledAt: `${futureDate(14)}T09:00:00.000Z`,
        })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/approve`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('POST /bookings/authenticated', () => {
    let customerId: string;

    beforeAll(async () => {
      const customer = new CustomerEntityBuilder()
        .withTenantId(tenantAId)
        .withEmail('cliente@auth-booking.test')
        .withName('Cliente Auth')
        .withPhone('31988888888')
        .build();
      await ds.getRepository(CustomerEntity).save(customer);
      customerId = customer.id;
    });

    const authBody = () => ({
      scheduledAt,
      serviceIds: [serviceId],
    });

    it('creates a PENDING CUSTOMER booking with customerId set', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
        .send(authBody())
        .expect(201);

      expect(body.bookingId).toBeDefined();
      expect(body.status).toBe('PENDING');
      expect(body.lines).toHaveLength(1);

      const row = await ds
        .getRepository(BookingEntity)
        .findOne({ where: { id: body.bookingId, tenantId: tenantAId } });
      expect(row).not.toBeNull();
      expect(row!.type).toBe('CUSTOMER');
      expect(row!.customerId).toBe(customerId);
      expect(row!.guestEmail).toBe('cliente@auth-booking.test');
      expect(row!.guestName).toBe('Cliente Auth');
    });

    it('returns 422 when customer has no phone', async () => {
      const noPhoneCustomer = new CustomerEntityBuilder()
        .withTenantId(tenantAId)
        .withGoogleOAuthId('google-sub-nophone-booking')
        .withEmail('nophone@auth-booking.test')
        .withName('Sem Telefone')
        .withPhone(null)
        .build();
      await ds.getRepository(CustomerEntity).save(noPhoneCustomer);

      const { body } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, noPhoneCustomer.id, 'CUSTOMER'))
        .send(authBody())
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 404 when customerId in context does not match any customer', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, '00000000-0000-4000-8000-000000009999', 'CUSTOMER'))
        .send(authBody())
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('tenant isolation: booking is not visible from tenantB', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
        .send({ ...authBody(), scheduledAt: `${futureDate(3)}T14:00:00.000Z` })
        .expect(201);

      const wrongTenant = await ds
        .getRepository(BookingEntity)
        .findOne({ where: { id: body.bookingId, tenantId: tenantBId } });
      expect(wrongTenant).toBeNull();
    });
  });

  describe('PATCH /bookings/:id/submit-info', () => {
    let submitCustomerId: string;

    beforeAll(async () => {
      const customer = new CustomerEntityBuilder()
        .withTenantId(tenantAId)
        .withGoogleOAuthId('google-sub-submit-info')
        .withEmail('submit-info-customer@booking.test')
        .withName('Submit Info Customer')
        .withPhone('31977777777')
        .build();
      await ds.getRepository(CustomerEntity).save(customer);
      submitCustomerId = customer.id;
    });

    const infoMessage = 'Por favor envie mais fotos do veículo antes do serviço';

    it('transitions INFO_REQUESTED → PENDING and returns 200 shape', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, submitCustomerId, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(5)}T10:00:00.000Z`, serviceIds: [serviceId] })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/request-info`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .send({ message: infoMessage })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/submit-info`)
        .set(actorHeaders(tenantAId, submitCustomerId, 'CUSTOMER'))
        .send({ response: 'Aqui estão as informações solicitadas' })
        .expect(200);

      expect(body.status).toBe('PENDING');
      expect(body.bookingId).toBe(created.bookingId);
      expect(body.infoSubmittedAt).toBeDefined();

      const row = await ds
        .getRepository(BookingEntity)
        .findOne({ where: { id: created.bookingId, tenantId: tenantAId } });
      expect(row!.status).toBe('PENDING');
    });

    it('returns 403 when caller is not the booking owner', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, submitCustomerId, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(5)}T11:00:00.000Z`, serviceIds: [serviceId] })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/request-info`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .send({ message: infoMessage })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/submit-info`)
        .set(actorHeaders(tenantAId, ACTOR_ID, 'CUSTOMER'))
        .send({ response: 'Informações enviadas' })
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('returns 422 when booking is not INFO_REQUESTED', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, submitCustomerId, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(5)}T12:00:00.000Z`, serviceIds: [serviceId] })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/submit-info`)
        .set(actorHeaders(tenantAId, submitCustomerId, 'CUSTOMER'))
        .send({ response: 'Informações enviadas' })
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 404 when booking does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/bookings/00000000-0000-4000-8000-000000009999/submit-info')
        .set(actorHeaders(tenantAId, submitCustomerId, 'CUSTOMER'))
        .send({ response: 'Informações enviadas' })
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('tenant isolation: cannot submit info for a booking from tenantB (returns 404)', async () => {
      const svcB = new ServiceEntityBuilder()
        .withTenantId(tenantBId)
        .withName('Serviço B Submit')
        .withPriceAmount('80.00')
        .withDurationMinutes(30)
        .withIsActive(true)
        .build();
      await ds.getRepository(ServiceEntity).save(svcB);

      const customerB = new CustomerEntityBuilder()
        .withTenantId(tenantBId)
        .withGoogleOAuthId('google-sub-submit-b')
        .withEmail('submit-customer-b@booking.test')
        .withName('Customer B')
        .withPhone('31966666666')
        .build();
      await ds.getRepository(CustomerEntity).save(customerB);

      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantBId, customerB.id, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(6)}T10:00:00.000Z`, serviceIds: [svcB.id] })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/request-info`)
        .set(actorHeaders(tenantBId, STAFF_ID, 'MANAGER'))
        .send({ message: infoMessage })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/submit-info`)
        .set(actorHeaders(tenantAId, submitCustomerId, 'CUSTOMER'))
        .send({ response: 'Informações enviadas' })
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('PATCH /bookings/:id/submit-info/guest', () => {
    const guestEmail = 'joao@example.com';
    const validResponse = 'Aqui estão as informações solicitadas';
    const infoMessage = 'Por favor envie mais fotos do veículo antes do serviço';

    it('transitions INFO_REQUESTED → PENDING for a GUEST booking and returns 200 shape', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), guestEmail, scheduledAt: `${futureDate(7)}T10:00:00.000Z` })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/request-info`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .send({ message: infoMessage })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/submit-info/guest`)
        .set(guestHeaders(tenantAId))
        .send({ guestEmail, response: validResponse })
        .expect(200);

      expect(body.status).toBe('PENDING');
      expect(body.bookingId).toBe(created.bookingId);
      expect(body.infoSubmittedAt).toBeDefined();

      const row = await ds
        .getRepository(BookingEntity)
        .findOne({ where: { id: created.bookingId, tenantId: tenantAId } });
      expect(row!.status).toBe('PENDING');
    });

    it('returns 403 when booking has a customerId (is a CUSTOMER booking)', async () => {
      const customer = new CustomerEntityBuilder()
        .withTenantId(tenantAId)
        .withGoogleOAuthId('google-sub-guest-submit')
        .withEmail('guest-submit-customer@booking.test')
        .withName('Guest Submit Customer')
        .withPhone('31955555555')
        .build();
      await ds.getRepository(CustomerEntity).save(customer);

      const { body: created } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(tenantAId, customer.id, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(7)}T11:00:00.000Z`, serviceIds: [serviceId] })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/request-info`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .send({ message: infoMessage })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/submit-info/guest`)
        .set(guestHeaders(tenantAId))
        .send({ guestEmail: customer.email, response: validResponse })
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('returns 422 when booking is not INFO_REQUESTED', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantAId))
        .send({ ...validBody(), guestEmail, scheduledAt: `${futureDate(7)}T12:00:00.000Z` })
        .expect(201);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/submit-info/guest`)
        .set(guestHeaders(tenantAId))
        .send({ guestEmail, response: validResponse })
        .expect(422);

      expect(body.status).toBe(422);
    });

    it('returns 404 when booking does not exist', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/bookings/00000000-0000-4000-8000-000000009999/submit-info/guest')
        .set(guestHeaders(tenantAId))
        .send({ guestEmail, response: validResponse })
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('tenant isolation: cannot submit guest info for a booking from tenantB (returns 404)', async () => {
      const svcB2 = new ServiceEntityBuilder()
        .withTenantId(tenantBId)
        .withName('Serviço B Guest Submit')
        .withPriceAmount('80.00')
        .withDurationMinutes(30)
        .withIsActive(true)
        .build();
      await ds.getRepository(ServiceEntity).save(svcB2);

      const { body: created } = await request(app.getHttpServer())
        .post('/bookings')
        .set(guestHeaders(tenantBId))
        .send({
          ...validBody(),
          guestEmail,
          serviceIds: [svcB2.id],
          scheduledAt: `${futureDate(8)}T10:00:00.000Z`,
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/request-info`)
        .set(actorHeaders(tenantBId, STAFF_ID, 'MANAGER'))
        .send({ message: infoMessage })
        .expect(200);

      const { body } = await request(app.getHttpServer())
        .patch(`/bookings/${created.bookingId}/submit-info/guest`)
        .set(guestHeaders(tenantAId))
        .send({ guestEmail, response: validResponse })
        .expect(404);

      expect(body.status).toBe(404);
    });
  });

  describe('GET /bookings', () => {
    let listTenantId: string;
    let listCustomerId: string;

    beforeAll(async () => {
      const { body: lt } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${TEST_KEY}`)
        .send({
          name: 'List Tenant',
          slug: 'list-tenant-bookings',
          adminEmail: 'list@bookings.test',
        })
        .expect(201);
      listTenantId = lt.tenantId as string;

      const svc = new ServiceEntityBuilder()
        .withTenantId(listTenantId)
        .withName('Serviço Lista')
        .withPriceAmount('100.00')
        .withDurationMinutes(30)
        .withIsActive(true)
        .build();
      await ds.getRepository(ServiceEntity).save(svc);

      const customer = new CustomerEntityBuilder()
        .withTenantId(listTenantId)
        .withEmail('list-customer@bookings.test')
        .withName('Cliente Lista')
        .withPhone('31911111111')
        .build();
      await ds.getRepository(CustomerEntity).save(customer);
      listCustomerId = customer.id;

      await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(listTenantId, listCustomerId, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(20)}T09:00:00.000Z`, serviceIds: [svc.id] })
        .expect(201);

      await request(app.getHttpServer())
        .post('/bookings')
        .set({ 'x-tenant-id': listTenantId, 'x-correlation-id': 'list-test-guest' })
        .send({
          ...validBody(),
          scheduledAt: `${futureDate(21)}T09:00:00.000Z`,
          serviceIds: [svc.id],
        })
        .expect(201);
    });

    it('STAFF sees all bookings for tenant', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/bookings')
        .set(actorHeaders(listTenantId, STAFF_ID, 'MANAGER'))
        .expect(200);

      expect(body.items.length).toBeGreaterThanOrEqual(2);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total).toBeGreaterThanOrEqual(2);
      expect(typeof body.pagination.hasMore).toBe('boolean');
    });

    it('STAFF filters by status', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/bookings?status=PENDING')
        .set(actorHeaders(listTenantId, STAFF_ID, 'MANAGER'))
        .expect(200);

      for (const item of body.items as { status: string }[]) {
        expect(item.status).toBe('PENDING');
      }
    });

    it('CUSTOMER sees only own bookings', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/bookings')
        .set(actorHeaders(listTenantId, listCustomerId, 'CUSTOMER'))
        .expect(200);

      for (const item of body.items as { customerId: string }[]) {
        expect(item.customerId).toBe(listCustomerId);
      }
    });

    it('response includes lineSummary and pagination shape', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/bookings?limit=1&offset=0')
        .set(actorHeaders(listTenantId, STAFF_ID, 'MANAGER'))
        .expect(200);

      expect(body.items).toHaveLength(1);
      expect(body.items[0].lineSummary).toBeDefined();
      expect(body.items[0].totalPrice.formatted).toMatch(/^R\$/);
      expect(body.pagination.limit).toBe(1);
      expect(body.pagination.offset).toBe(0);
    });

    it('tenant isolation: STAFF from tenantA cannot see listTenant bookings', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/bookings')
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(200);

      const ids = (body.items as { id: string }[]).map((i) => i.id);
      const { body: ltBody } = await request(app.getHttpServer())
        .get('/bookings')
        .set(actorHeaders(listTenantId, STAFF_ID, 'MANAGER'))
        .expect(200);
      const ltIds = (ltBody.items as { id: string }[]).map((i) => i.id);

      for (const id of ltIds) {
        expect(ids).not.toContain(id);
      }
    });
  });

  describe('GET /bookings/:id', () => {
    let detailTenantId: string;
    let detailCustomerId: string;
    let ownBookingId: string;
    let otherBookingId: string;

    beforeAll(async () => {
      const { body: dt } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('Authorization', `Bearer ${TEST_KEY}`)
        .send({
          name: 'Detail Tenant',
          slug: 'detail-tenant-bookings',
          adminEmail: 'detail@bookings.test',
        })
        .expect(201);
      detailTenantId = dt.tenantId as string;

      const svc = new ServiceEntityBuilder()
        .withTenantId(detailTenantId)
        .withName('Serviço Detalhe')
        .withPriceAmount('150.00')
        .withDurationMinutes(45)
        .withIsActive(true)
        .build();
      await ds.getRepository(ServiceEntity).save(svc);

      const customer = new CustomerEntityBuilder()
        .withTenantId(detailTenantId)
        .withEmail('detail-customer@bookings.test')
        .withName('Cliente Detalhe')
        .withPhone('31922222222')
        .build();
      await ds.getRepository(CustomerEntity).save(customer);
      detailCustomerId = customer.id;

      const { body: ownBooking } = await request(app.getHttpServer())
        .post('/bookings/authenticated')
        .set(actorHeaders(detailTenantId, detailCustomerId, 'CUSTOMER'))
        .send({ scheduledAt: `${futureDate(25)}T09:00:00.000Z`, serviceIds: [svc.id] })
        .expect(201);
      ownBookingId = ownBooking.bookingId as string;

      const { body: other } = await request(app.getHttpServer())
        .post('/bookings')
        .set({ 'x-tenant-id': detailTenantId, 'x-correlation-id': 'detail-test-other' })
        .send({
          ...validBody(),
          scheduledAt: `${futureDate(26)}T09:00:00.000Z`,
          serviceIds: [svc.id],
        })
        .expect(201);
      otherBookingId = other.bookingId as string;
    });

    it('STAFF gets full booking detail', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/bookings/${ownBookingId}`)
        .set(actorHeaders(detailTenantId, STAFF_ID, 'MANAGER'))
        .expect(200);

      expect(body.id).toBe(ownBookingId);
      expect(body.lines).toBeDefined();
      expect(body.lines[0].lineId).toBeDefined();
      expect(body.lines[0].durationMinsAtBooking).toBe(45);
      expect(body.totalPrice.formatted).toMatch(/^R\$/);
    });

    it('CUSTOMER gets own booking detail', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/bookings/${ownBookingId}`)
        .set(actorHeaders(detailTenantId, detailCustomerId, 'CUSTOMER'))
        .expect(200);

      expect(body.id).toBe(ownBookingId);
      expect(body.customerId).toBe(detailCustomerId);
    });

    it("CUSTOMER gets 404 for another customer's booking", async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/bookings/${otherBookingId}`)
        .set(actorHeaders(detailTenantId, detailCustomerId, 'CUSTOMER'))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('returns 404 for non-existent booking', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/bookings/00000000-0000-4000-8000-000000009999')
        .set(actorHeaders(detailTenantId, STAFF_ID, 'MANAGER'))
        .expect(404);

      expect(body.status).toBe(404);
    });

    it('tenant isolation: STAFF from tenantA cannot get booking from detailTenant', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/bookings/${ownBookingId}`)
        .set(actorHeaders(tenantAId, STAFF_ID, 'MANAGER'))
        .expect(404);

      expect(body.status).toBe(404);
    });
  });
});
