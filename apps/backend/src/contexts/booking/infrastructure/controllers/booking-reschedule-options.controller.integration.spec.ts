import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { StaffEntityBuilder } from '../../../../test/builders/staff';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { futureDate } from '../../../../test/utils/date-helpers';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { PlatformModule } from '../../../platform/platform.module';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';

const TEST_KEY = 'booking-integ-test-key-reschedule-xx'; // 36 chars
const MANAGER_ID = '20000000-0000-4000-8000-000000000a01';

describe('GET /bookings/:id — reschedule block (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;
  let customerId: string;
  let otherCustomerId: string;
  let staffResourceId: string;
  let serviceId: string;

  const scheduledAtOn = (daysAhead: number) => `${futureDate(daysAhead)}T13:00:00.000Z`;

  async function createTenant(slug: string): Promise<string> {
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
  }

  async function createCustomer(email: string): Promise<string> {
    const customer = new CustomerEntityBuilder()
      .withTenantId(tenantAId)
      .withGoogleOAuthId(`google-${email}`)
      .withEmail(email)
      .withPhone('+5531988887777')
      .build();
    await ds.getRepository(CustomerEntity).save(customer);
    return customer.id;
  }

  async function requestBooking(daysAhead: number): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/bookings/authenticated')
      .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
      .send({
        scheduledAt: scheduledAtOn(daysAhead),
        serviceIds: [serviceId],
        resourceSelections: [
          { serviceId, legIndex: null, resourceType: 'STAFF', resourceId: staffResourceId },
        ],
      })
      .expect(201);
    return body.bookingId as string;
  }

  async function createApprovedBooking(daysAhead: number): Promise<string> {
    const bookingId = await requestBooking(daysAhead);
    await request(app.getHttpServer())
      .patch(`/bookings/${bookingId}/approve`)
      .set(actorHeaders(tenantAId, MANAGER_ID, 'MANAGER'))
      .expect(200);
    return bookingId;
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));
    tenantAId = await createTenant('reschedule-options-a');
    tenantBId = await createTenant('reschedule-options-b');
    customerId = await createCustomer('owner@reschedule-options.test');
    otherCustomerId = await createCustomer('other@reschedule-options.test');

    const staff = new StaffEntityBuilder()
      .withTenantId(tenantAId)
      .withEmail('staff@reschedule-options.test')
      .withIsActive(true)
      .build();
    await ds.getRepository(StaffEntity).save(staff);
    const { body: resource } = await request(app.getHttpServer())
      .post('/resources')
      .set(actorHeaders(tenantAId, MANAGER_ID))
      .send({ type: 'STAFF', name: 'Renata Souza', refId: staff.id })
      .expect(201);
    staffResourceId = resource.id as string;

    const { body: service } = await request(app.getHttpServer())
      .post('/services')
      .set(actorHeaders(tenantAId, MANAGER_ID))
      .send({
        name: 'Massagem com Profissional',
        description: 'Descrição',
        priceAmount: 100,
        durationMinutes: 30,
        loyaltyPointsValue: 5,
        requiresPickupAddress: false,
      })
      .expect(201);
    serviceId = service.id as string;
    await request(app.getHttpServer())
      .patch(`/services/${serviceId}/resource-requirements`)
      .set(actorHeaders(tenantAId, MANAGER_ID))
      .send({ resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }] })
      .expect(200);
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  it('returns the kept pick, the pinned availability inputs and the deadline to the owner', async () => {
    const bookingId = await createApprovedBooking(40);

    const { body } = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
      .expect(200);

    expect(body.reschedule.serviceIds).toEqual([serviceId]);
    expect(body.reschedule.resourceSelections).toEqual([
      { serviceId, legIndex: null, resourceType: 'STAFF', resourceId: staffResourceId },
    ]);
    expect(body.reschedule.keptPicks).toEqual([
      expect.objectContaining({ resourceType: 'STAFF', resourceName: 'Renata Souza' }),
    ]);
    expect(body.reschedule.durationMinutes).toBeNull();
    expect(new Date(body.reschedule.eligibleUntil).getTime()).toBeLessThan(
      new Date(scheduledAtOn(40)).getTime(),
    );
    expect(body.reschedule.window.maxAdvanceDays).toBeGreaterThan(0);
  });

  it('is null for a PENDING booking', async () => {
    const bookingId = await requestBooking(41);

    const { body } = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set(actorHeaders(tenantAId, customerId, 'CUSTOMER'))
      .expect(200);

    expect(body.reschedule).toBeNull();
  });

  it('is null for a staff read of an APPROVED booking', async () => {
    const bookingId = await createApprovedBooking(42);

    const { body } = await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set(actorHeaders(tenantAId, MANAGER_ID, 'MANAGER'))
      .expect(200);

    expect(body.reschedule).toBeNull();
  });

  it('tenant isolation: a Tenant B caller gets 404 for a Tenant A booking', async () => {
    const bookingId = await createApprovedBooking(43);

    await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set(actorHeaders(tenantBId, customerId, 'CUSTOMER'))
      .expect(404);
  });

  it('another customer of the same tenant gets 404', async () => {
    const bookingId = await createApprovedBooking(44);

    await request(app.getHttpServer())
      .get(`/bookings/${bookingId}`)
      .set(actorHeaders(tenantAId, otherCustomerId, 'CUSTOMER'))
      .expect(404);
  });
});
