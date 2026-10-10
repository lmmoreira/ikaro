import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ServiceEntityBuilder } from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { futureDate } from '../../../../test/utils/date-helpers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { PlatformModule } from '../../../platform/platform.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { ServiceEntity } from '../entities/service.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingStatusTransitionEntity } from '../entities/booking-status-transition.entity';

// M23-S39 (UC-108) — POST /bookings/staff against a real database: the booking is created
// APPROVED with COMMITTED occupancy, for a customer or a guest, and the same slot cannot be taken
// twice.
const TEST_KEY = 'booking-integ-test-key-staffbk-xxx'; // 36 chars
const STAFF_ID = '20000000-0000-4000-8000-000000000391';
const CORRELATION_ID = '01980000-0000-7000-8000-0000000000c9';

const slot = (daysAhead: number, hour: number) =>
  `${futureDate(daysAhead)}T${String(hour).padStart(2, '0')}:00:00.000Z`;

describe('POST /bookings/staff (integration, M23-S39)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;
  let serviceId: string;
  let pickupServiceId: string;
  let customerId: string;
  let otherTenantCustomerId: string;
  let noPhoneCustomerId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));

    const createTenant = async (slug: string): Promise<string> => {
      const { body } = await request(app.getHttpServer())
        .post('/internal/tenants')
        .set('X-Platform-Admin-Key', TEST_KEY)
        .send({
          name: slug,
          slug,
          adminEmail: `admin@${slug}.test`,
          country_code: 'BR',
        })
        .expect(201);
      return body.tenantId as string;
    };
    tenantAId = await createTenant('staff-booking-tenant-a');
    tenantBId = await createTenant('staff-booking-tenant-b');

    const service = new ServiceEntityBuilder()
      .withTenantId(tenantAId)
      .withName('Lavagem Completa')
      .withPriceAmount('100.00')
      .withDurationMinutes(30)
      .withIsActive(true)
      .build();
    const pickupService = new ServiceEntityBuilder()
      .withTenantId(tenantAId)
      .withName('Coleta em Domicílio')
      .withPriceAmount('50.00')
      .withDurationMinutes(20)
      .withRequiresPickupAddress(true)
      .withIsActive(true)
      .build();
    await ds.getRepository(ServiceEntity).save([service, pickupService]);
    serviceId = service.id;
    pickupServiceId = pickupService.id;

    const customers = ds.getRepository(CustomerEntity);
    const customer = new CustomerEntityBuilder()
      .withTenantId(tenantAId)
      .withGoogleOAuthId('sub-s39-staff-customer')
      .withEmail('cliente@staff-booking.test')
      .withName('Cliente Balcão')
      .withPhone('+5531988888888')
      .build();
    const otherTenantCustomer = new CustomerEntityBuilder()
      .withTenantId(tenantBId)
      .withGoogleOAuthId('sub-s39-staff-other-tenant')
      .withEmail('outro@staff-booking.test')
      .withName('Cliente Outro Tenant')
      .withPhone('+5531977777777')
      .build();
    const noPhoneCustomer = new CustomerEntityBuilder()
      .withTenantId(tenantAId)
      .withGoogleOAuthId('sub-s39-staff-no-phone')
      .withEmail('semtel@staff-booking.test')
      .withName('Cliente Sem Telefone')
      .withPhone(null)
      .build();
    await customers.save([customer, otherTenantCustomer, noPhoneCustomer]);
    customerId = customer.id;
    otherTenantCustomerId = otherTenantCustomer.id;
    noPhoneCustomerId = noPhoneCustomer.id;
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  const staff = (tenantId = tenantAId) => actorHeaders(tenantId, STAFF_ID, 'STAFF', CORRELATION_ID);

  const post = (body: unknown, headers: Record<string, string> = staff()) =>
    request(app.getHttpServer())
      .post('/bookings/staff')
      .set(headers)
      .send(body as object);

  it('creates an APPROVED customer booking recording the acting staff member', async () => {
    const { body } = await post({
      customerId,
      scheduledAt: slot(3, 9),
      serviceIds: [serviceId],
    }).expect(201);

    expect(body.status).toBe('APPROVED');
    expect(body.lines).toHaveLength(1);

    const row = await ds
      .getRepository(BookingEntity)
      .findOne({ where: { id: body.bookingId, tenantId: tenantAId } });
    expect(row).not.toBeNull();
    expect(row!.status).toBe('APPROVED');
    expect(row!.type).toBe('CUSTOMER');
    expect(row!.customerId).toBe(customerId);
    expect(row!.contactEmail).toBe('cliente@staff-booking.test');
    expect(row!.contactPhone).toBe('+5531988888888');
    expect(row!.approvedBy).toBe(STAFF_ID);
    expect(row!.approvedAt).not.toBeNull();
    expect(row!.createdByStaffId).toBe(STAFF_ID);
  });

  it('creates an APPROVED guest booking from the contact trio, with no customer row', async () => {
    const { body } = await post({
      contactName: 'Pessoa de Passagem',
      contactPhone: '+5531966666666',
      contactEmail: 'passagem@staff-booking.test',
      scheduledAt: slot(3, 11),
      serviceIds: [serviceId],
    }).expect(201);

    const row = await ds
      .getRepository(BookingEntity)
      .findOne({ where: { id: body.bookingId, tenantId: tenantAId } });
    expect(row!.status).toBe('APPROVED');
    expect(row!.type).toBe('GUEST');
    expect(row!.customerId).toBeNull();
    expect(row!.contactName).toBe('Pessoa de Passagem');
    expect(row!.createdByStaffId).toBe(STAFF_ID);
    expect(
      await ds
        .getRepository(CustomerEntity)
        .count({ where: { tenantId: tenantAId, email: 'passagem@staff-booking.test' } }),
    ).toBe(0);
  });

  it('takes a COMMITTED occupancy with no hold expiry and writes no status transition', async () => {
    const { body } = await post({
      customerId,
      scheduledAt: slot(3, 13),
      serviceIds: [serviceId],
    }).expect(201);

    const rows: { lock_state: string; hold_expires_at: Date | null }[] = await ds.query(
      `SELECT o.lock_state, o.hold_expires_at
         FROM booking.resource_occupancy o
         JOIN booking.booking_line_resource_assignments a
           ON a.id = o.booking_line_resource_assignment_id
         JOIN booking.booking_lines l ON l.tenant_id = a.tenant_id AND l.line_id = a.booking_line_id
        WHERE l.tenant_id = $1 AND l.booking_id = $2`,
      [tenantAId, body.bookingId],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((o) => o.lock_state === 'COMMITTED' && o.hold_expires_at === null)).toBe(
      true,
    );

    expect(
      await ds
        .getRepository(BookingStatusTransitionEntity)
        .count({ where: { tenantId: tenantAId, bookingId: body.bookingId } }),
    ).toBe(0);
  });

  it('falls back to the customer default address for a pickup-required service', async () => {
    await ds.getRepository(CustomerEntity).update(
      { id: customerId, tenantId: tenantAId },
      {
        defaultAddress: {
          street: 'Rua Padrão',
          number: '5',
          neighborhood: 'Centro',
          city: 'Belo Horizonte',
          state: 'MG',
          zipCode: '30100000',
        },
      },
    );

    const { body } = await post({
      customerId,
      scheduledAt: slot(4, 9),
      serviceIds: [pickupServiceId],
    }).expect(201);

    expect(body.pickupAddress.street).toBe('Rua Padrão');
  });

  it('refuses a guest booking for a pickup-required service with no address', async () => {
    expect(
      (
        await post({
          contactName: 'Sem Endereço',
          contactPhone: '+5531955555555',
          contactEmail: 'semendereco@staff-booking.test',
          scheduledAt: slot(4, 11),
          serviceIds: [pickupServiceId],
        })
      ).status,
    ).toBe(400);
  });

  it('returns 409 for the second of two concurrent requests for the same slot', async () => {
    const body = { customerId, scheduledAt: slot(5, 9), serviceIds: [serviceId] };

    const results = await Promise.all([post(body), post(body)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const conflict = results.find((r) => r.status === 409)!;
    expect(conflict.body.code).toBe('BOOKING_SLOT_UNAVAILABLE');
  });

  describe('who the booking is for', () => {
    const base = () => ({ scheduledAt: slot(6, 9), serviceIds: [serviceId] });

    it('returns 400 when both customerId and contact fields are sent', async () => {
      expect(
        (
          await post({
            ...base(),
            customerId,
            contactName: 'X',
            contactPhone: '+5531955555555',
            contactEmail: 'x@staff-booking.test',
          })
        ).status,
      ).toBe(400);
    });

    it('returns 400 when neither is sent', async () => {
      expect((await post(base())).status).toBe(400);
    });

    it('returns 400 when the contact trio is incomplete', async () => {
      expect(
        (await post({ ...base(), contactName: 'Só Nome', contactPhone: '+5531955555555' })).status,
      ).toBe(400);
    });

    it('returns 400 for beforeServicePhotoUrls — the staff flow collects no photos', async () => {
      expect(
        (
          await post({
            ...base(),
            customerId,
            beforeServicePhotoUrls: [`tmp/${tenantAId}/upload-1/car.jpg`],
          })
        ).status,
      ).toBe(400);
    });

    // Negative guarantee: the acting staff id comes from the context, never the body.
    it('returns 400 for a createdByStaffId or approvedBy in the body', async () => {
      expect((await post({ ...base(), customerId, createdByStaffId: STAFF_ID })).status).toBe(400);
      expect((await post({ ...base(), customerId, approvedBy: STAFF_ID })).status).toBe(400);
    });

    it('returns 422 BOOKING_CUSTOMER_PHONE_NOT_SET for a chosen customer without a phone', async () => {
      const { body } = await post({ ...base(), customerId: noPhoneCustomerId }).expect(422);

      expect(body.code).toBe('BOOKING_CUSTOMER_PHONE_NOT_SET');
    });

    it('returns 404 BOOKING_CUSTOMER_NOT_FOUND for an unknown customer', async () => {
      const { body } = await post({
        ...base(),
        customerId: '20000000-0000-4000-8000-000000009391',
      }).expect(404);

      expect(body.code).toBe('BOOKING_CUSTOMER_NOT_FOUND');
    });
  });

  describe('tenant isolation', () => {
    it("Tenant A's staff cannot book for Tenant B's customer — 404, and nothing is created", async () => {
      const before = await ds
        .getRepository(BookingEntity)
        .count({ where: { tenantId: tenantAId } });

      const { body } = await post({
        customerId: otherTenantCustomerId,
        scheduledAt: slot(7, 9),
        serviceIds: [serviceId],
      }).expect(404);

      expect(body.code).toBe('BOOKING_CUSTOMER_NOT_FOUND');
      expect(await ds.getRepository(BookingEntity).count({ where: { tenantId: tenantAId } })).toBe(
        before,
      );
    });

    it("Tenant A's staff cannot book Tenant B's service", async () => {
      const bService = new ServiceEntityBuilder()
        .withTenantId(tenantBId)
        .withName('Serviço do B')
        .withIsActive(true)
        .build();
      await ds.getRepository(ServiceEntity).save(bService);

      expect(
        (
          await post({
            customerId,
            scheduledAt: slot(7, 11),
            serviceIds: [bService.id],
          })
        ).status,
      ).toBe(400);
    });

    it('stamps the created booking with the caller tenant', async () => {
      const { body } = await post({
        customerId,
        scheduledAt: slot(7, 13),
        serviceIds: [serviceId],
      }).expect(201);

      const row = await ds.getRepository(BookingEntity).findOne({ where: { id: body.bookingId } });
      expect(row!.tenantId).toBe(tenantAId);
    });
  });

  describe('window and role', () => {
    it('still refuses a start in the past with 422', async () => {
      expect(
        (
          await post({
            customerId,
            scheduledAt: `${futureDate(-2)}T09:00:00.000Z`,
            serviceIds: [serviceId],
          })
        ).status,
      ).toBe(422);
    });

    it('still refuses a start beyond the maximum advance with 422', async () => {
      const { body } = await post({
        customerId,
        scheduledAt: slot(400, 9),
        serviceIds: [serviceId],
      }).expect(422);

      expect(body.code).toBe('BOOKING_TOO_FAR_AHEAD');
    });

    it('returns 403 for a CUSTOMER token', async () => {
      expect(
        (
          await post(
            { customerId, scheduledAt: slot(8, 9), serviceIds: [serviceId] },
            actorHeaders(tenantAId, customerId, 'CUSTOMER', CORRELATION_ID),
          )
        ).status,
      ).toBe(403);
    });
  });
});
