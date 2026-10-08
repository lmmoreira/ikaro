import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  AvailabilityAlertEntityBuilder,
  ResourceEntityBuilder,
  ServiceEntityBuilder,
  ServiceResourceRequirementEntityBuilder,
} from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { PlatformModule } from '../../../platform/platform.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { AvailabilityAlertEntity } from '../entities/availability-alert.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { ServiceEntity } from '../entities/service.entity';
import { ServiceResourceRequirementEntity } from '../entities/service-resource-requirement.entity';
import { ResourceType } from '../../domain/resource.types';

const TEST_KEY = 'alert-integ-test-key-booking-xxx'; // 33 chars, same shape as sibling specs
const CUSTOMER_A = '20000000-0000-4000-8000-000000000701';
const CUSTOMER_A2 = '20000000-0000-4000-8000-000000000702';
const CUSTOMER_B = '20000000-0000-4000-8000-000000000703';
const DAY_MS = 86_400_000;

describe('AvailabilityAlertController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantA: string;
  let tenantB: string;
  let serviceA: string;
  let ineligibleServiceA: string;
  let roomA: string;
  let serviceB: string;
  let variableServiceA: string;

  const createTenant = async (slug: string): Promise<string> => {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: `Alert ${slug}`,
        slug,
        adminEmail: `admin@${slug}.test`,
        country_code: 'BR',
      })
      .expect(201);
    return body.tenantId as string;
  };

  const seedService = async (
    tenantId: string,
    eligible: boolean,
    configure: (builder: ServiceEntityBuilder) => ServiceEntityBuilder = (builder) => builder,
  ): Promise<string> => {
    const service = await ds
      .getRepository(ServiceEntity)
      .save(
        configure(
          new ServiceEntityBuilder().withTenantId(tenantId).withAvailabilityAlertEligible(eligible),
        ).build(),
      );
    await ds
      .getRepository(ServiceResourceRequirementEntity)
      .save(
        new ServiceResourceRequirementEntityBuilder()
          .withTenantId(tenantId)
          .withServiceId(service.id)
          .withResourceType(ResourceType.ROOM)
          .withSelectionMode('CUSTOMER_CHOICE')
          .build(),
      );
    return service.id;
  };

  const as = (tenantId: string, customerId: string) =>
    actorHeaders(tenantId, customerId, 'CUSTOMER');

  const weeklyBody = (serviceId: string) => ({
    serviceId,
    criteriaType: 'WEEKLY_PREFERENCE',
    weekdays: ['tuesday', 'thursday'],
    localStartTime: '18:00',
    localEndTime: '20:00',
    durationMinutes: 120,
    participantCount: 2,
  });

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));
    tenantA = await createTenant('alert-tenant-a');
    tenantB = await createTenant('alert-tenant-b');

    for (const [tenantId, customerId, email] of [
      [tenantA, CUSTOMER_A, 'a1@alert.test'],
      [tenantA, CUSTOMER_A2, 'a2@alert.test'],
      [tenantB, CUSTOMER_B, 'b1@alert.test'],
    ]) {
      await ds
        .getRepository(CustomerEntity)
        .save(
          new CustomerEntityBuilder()
            .withTenantId(tenantId)
            .withId(customerId)
            .withGoogleOAuthId(`google-${customerId}`)
            .withEmail(email)
            .withName('Cliente Alerta')
            .withPhone('+5531999999999')
            .build(),
        );
    }
    serviceA = await seedService(tenantA, true);
    ineligibleServiceA = await seedService(tenantA, false);
    serviceB = await seedService(tenantB, true);
    variableServiceA = await seedService(tenantA, true, (builder) =>
      builder
        .withDurationPolicy('CUSTOMER_SELECTED')
        .withDurationMinMinutes(30)
        .withDurationMaxMinutes(120)
        .withDurationIncrementMinutes(30),
    );
    const room = await ds
      .getRepository(ResourceEntity)
      .save(new ResourceEntityBuilder().withTenantId(tenantA).withType(ResourceType.ROOM).build());
    roomA = room.id;
  });

  afterAll(async () => {
    for (const tenantId of [tenantA, tenantB]) {
      await ds.getRepository(AvailabilityAlertEntity).delete({ tenantId });
      await ds.getRepository(ServiceResourceRequirementEntity).delete({ tenantId });
      await ds.getRepository(ResourceEntity).delete({ tenantId });
      await ds.getRepository(ServiceEntity).delete({ tenantId });
      await ds.getRepository(CustomerEntity).delete({ tenantId });
    }
    await app.close();
  });

  beforeEach(async () => {
    await ds.getRepository(AvailabilityAlertEntity).delete({ tenantId: tenantA });
    await ds.getRepository(AvailabilityAlertEntity).delete({ tenantId: tenantB });
  });

  it('POST /availability-alerts persists the alert and GET returns it', async () => {
    const { body: created } = await request(app.getHttpServer())
      .post('/availability-alerts')
      .set(as(tenantA, CUSTOMER_A))
      .send({ ...weeklyBody(serviceA), preferredResourceId: roomA })
      .expect(201);

    expect(created).toMatchObject({
      status: 'ACTIVE',
      criteriaType: 'WEEKLY_PREFERENCE',
      weekdays: ['tuesday', 'thursday'],
      localStartTime: '18:00',
      localEndTime: '20:00',
      preferredResourceId: roomA,
      durationMinutes: 120,
      participantCount: 2,
    });
    const { body: list } = await request(app.getHttpServer())
      .get('/availability-alerts')
      .set(as(tenantA, CUSTOMER_A))
      .expect(200);
    expect(list.items.map((item: { id: string }) => item.id)).toEqual([created.id]);
  });

  it('persists a one-time range with a clamped expiry', async () => {
    const start = new Date(Date.now() + 2 * DAY_MS);
    const end = new Date(Date.now() + 2 * DAY_MS + 4 * 3_600_000);

    const { body } = await request(app.getHttpServer())
      .post('/availability-alerts')
      .set(as(tenantA, CUSTOMER_A))
      .send({
        serviceId: serviceA,
        criteriaType: 'ONE_TIME_RANGE',
        acceptableStartAt: start.toISOString(),
        acceptableEndAt: end.toISOString(),
      })
      .expect(201);

    expect(body).toMatchObject({
      criteriaType: 'ONE_TIME_RANGE',
      acceptableStartAt: start.toISOString(),
      acceptableEndAt: end.toISOString(),
      weekdays: null,
      expiresAt: end.toISOString(),
    });
  });

  it('PATCH switches the criteria type and clears the old representation in the database', async () => {
    const { body: created } = await request(app.getHttpServer())
      .post('/availability-alerts')
      .set(as(tenantA, CUSTOMER_A))
      .send(weeklyBody(serviceA))
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/availability-alerts/${created.id as string}`)
      .set(as(tenantA, CUSTOMER_A))
      .send({
        criteriaType: 'ONE_TIME_RANGE',
        acceptableStartAt: new Date(Date.now() + DAY_MS).toISOString(),
        acceptableEndAt: new Date(Date.now() + DAY_MS + 3_600_000).toISOString(),
      })
      .expect(200);

    const row = await ds
      .getRepository(AvailabilityAlertEntity)
      .findOneByOrFail({ tenantId: tenantA, id: created.id as string });
    expect(row.criteriaType).toBe('ONE_TIME_RANGE');
    expect(row.weekdays).toBeNull();
    expect(row.localStartTime).toBeNull();
    expect(row.acceptableStartAt).not.toBeNull();
    expect(row.version).toBe(2);
  });

  it('DELETE cancels the alert; a second DELETE is still 200; a cancelled alert cannot be edited', async () => {
    const { body: created } = await request(app.getHttpServer())
      .post('/availability-alerts')
      .set(as(tenantA, CUSTOMER_A))
      .send(weeklyBody(serviceA))
      .expect(201);
    const url = `/availability-alerts/${created.id as string}`;

    await request(app.getHttpServer()).delete(url).set(as(tenantA, CUSTOMER_A)).expect(200);
    await request(app.getHttpServer()).delete(url).set(as(tenantA, CUSTOMER_A)).expect(200);
    await request(app.getHttpServer())
      .patch(url)
      .set(as(tenantA, CUSTOMER_A))
      .send({ durationMinutes: 30 })
      .expect(409);

    const row = await ds
      .getRepository(AvailabilityAlertEntity)
      .findOneByOrFail({ tenantId: tenantA, id: created.id as string });
    expect(row.status).toBe('CANCELLED');
  });

  it('rejects a service that does not permit alerts (422) and an invalid criteria set (422)', async () => {
    await request(app.getHttpServer())
      .post('/availability-alerts')
      .set(as(tenantA, CUSTOMER_A))
      .send(weeklyBody(ineligibleServiceA))
      .expect(422);
    await request(app.getHttpServer())
      .post('/availability-alerts')
      .set(as(tenantA, CUSTOMER_A))
      .send({ ...weeklyBody(serviceA), localStartTime: '20:00', localEndTime: '18:00' })
      .expect(422);
    expect(
      await ds.getRepository(AvailabilityAlertEntity).count({ where: { tenantId: tenantA } }),
    ).toBe(0);
  });

  describe('duration on a customer-selected-duration service', () => {
    const post = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/availability-alerts')
        .set(as(tenantA, CUSTOMER_A))
        .send(body);
    const alertCount = () =>
      ds.getRepository(AvailabilityAlertEntity).count({ where: { tenantId: tenantA } });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['below the minimum', 15],
      ['above the maximum', 150],
      ['off the increment', 45],
    ])('POST refuses a duration that is %s with 422 and writes no row', async (_label, value) => {
      // `undefined` is dropped by JSON serialisation, so the 'missing' case sends no key at all.
      const { body } = await post({
        ...weeklyBody(variableServiceA),
        durationMinutes: value,
      }).expect(422);

      expect(body.code).toBe('BOOKING_DURATION_OUT_OF_RANGE');
      expect(await alertCount()).toBe(0);
    });

    it('POST accepts a valid duration, and PATCH validates a changed one against the service', async () => {
      const { body: created } = await post({
        ...weeklyBody(variableServiceA),
        durationMinutes: 60,
      }).expect(201);
      const url = `/availability-alerts/${created.id as string}`;
      const patch = (payload: Record<string, unknown>) =>
        request(app.getHttpServer()).patch(url).set(as(tenantA, CUSTOMER_A)).send(payload);

      await patch({ durationMinutes: 90 }).expect(200);
      await patch({ durationMinutes: 45 }).expect(422);
      const { body: cleared } = await patch({ durationMinutes: null }).expect(422);
      expect(cleared.code).toBe('BOOKING_DURATION_OUT_OF_RANGE');
      await patch({ participantCount: 3 }).expect(200);

      const row = await ds
        .getRepository(AvailabilityAlertEntity)
        .findOneByOrFail({ tenantId: tenantA, id: created.id as string });
      expect(row.durationMinutes).toBe(90);
    });

    it('keeps a FIXED-duration service accepting any duration, and another tenant is refused first', async () => {
      await post({ ...weeklyBody(serviceA), durationMinutes: 45 }).expect(201);
      await request(app.getHttpServer())
        .post('/availability-alerts')
        .set(as(tenantB, CUSTOMER_B))
        .send({ ...weeklyBody(variableServiceA), durationMinutes: 45 })
        .expect(400);
    });
  });

  it('rejects the 11th active alert with 409 and still allows another customer', async () => {
    for (let i = 0; i < 10; i++) {
      await ds
        .getRepository(AvailabilityAlertEntity)
        .save(
          new AvailabilityAlertEntityBuilder()
            .withTenantId(tenantA)
            .withServiceId(serviceA)
            .withCustomerId(CUSTOMER_A)
            .build(),
        );
    }

    await request(app.getHttpServer())
      .post('/availability-alerts')
      .set(as(tenantA, CUSTOMER_A))
      .send(weeklyBody(serviceA))
      .expect(409);
    await request(app.getHttpServer())
      .post('/availability-alerts')
      .set(as(tenantA, CUSTOMER_A2))
      .send(weeklyBody(serviceA))
      .expect(201);
    const active = (customerId: string) =>
      ds
        .getRepository(AvailabilityAlertEntity)
        .count({ where: { tenantId: tenantA, customerId, status: 'ACTIVE' } });
    expect(await active(CUSTOMER_A)).toBe(10);
    expect(await active(CUSTOMER_A2)).toBe(1);
  });

  it('serializes concurrent creates so the cap holds', async () => {
    for (let i = 0; i < 9; i++) {
      await ds
        .getRepository(AvailabilityAlertEntity)
        .save(
          new AvailabilityAlertEntityBuilder()
            .withTenantId(tenantA)
            .withServiceId(serviceA)
            .withCustomerId(CUSTOMER_A)
            .build(),
        );
    }

    const responses = await Promise.all(
      [1, 2, 3].map(() =>
        request(app.getHttpServer())
          .post('/availability-alerts')
          .set(as(tenantA, CUSTOMER_A))
          .send(weeklyBody(serviceA)),
      ),
    );

    expect(responses.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(
      await ds
        .getRepository(AvailabilityAlertEntity)
        .count({ where: { tenantId: tenantA, customerId: CUSTOMER_A, status: 'ACTIVE' } }),
    ).toBe(10);
  });

  describe('tenant and customer isolation', () => {
    it("never lets another customer of the same tenant read, edit or cancel someone's alert", async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/availability-alerts')
        .set(as(tenantA, CUSTOMER_A))
        .send(weeklyBody(serviceA))
        .expect(201);
      const url = `/availability-alerts/${created.id as string}`;

      const { body: list } = await request(app.getHttpServer())
        .get('/availability-alerts')
        .set(as(tenantA, CUSTOMER_A2))
        .expect(200);
      expect(list.items).toEqual([]);
      await request(app.getHttpServer())
        .patch(url)
        .set(as(tenantA, CUSTOMER_A2))
        .send({ durationMinutes: 30 })
        .expect(404);
      await request(app.getHttpServer()).delete(url).set(as(tenantA, CUSTOMER_A2)).expect(404);
      const row = await ds
        .getRepository(AvailabilityAlertEntity)
        .findOneByOrFail({ tenantId: tenantA, id: created.id as string });
      expect(row.status).toBe('ACTIVE');
    });

    it("never crosses the tenant boundary: tenant B's customer gets 404 on tenant A's alert", async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/availability-alerts')
        .set(as(tenantA, CUSTOMER_A))
        .send(weeklyBody(serviceA))
        .expect(201);
      const url = `/availability-alerts/${created.id as string}`;

      await request(app.getHttpServer())
        .patch(url)
        .set(as(tenantB, CUSTOMER_B))
        .send({ durationMinutes: 30 })
        .expect(404);
      await request(app.getHttpServer()).delete(url).set(as(tenantB, CUSTOMER_B)).expect(404);
      const { body: list } = await request(app.getHttpServer())
        .get('/availability-alerts')
        .set(as(tenantB, CUSTOMER_B))
        .expect(200);
      expect(list.items).toEqual([]);
    });

    it("rejects tenant A's service id used from tenant B", async () => {
      await request(app.getHttpServer())
        .post('/availability-alerts')
        .set(as(tenantB, CUSTOMER_B))
        .send(weeklyBody(serviceA))
        .expect(400);
      await request(app.getHttpServer())
        .post('/availability-alerts')
        .set(as(tenantB, CUSTOMER_B))
        .send(weeklyBody(serviceB))
        .expect(201);
      const count = (tenantId: string) =>
        ds.getRepository(AvailabilityAlertEntity).count({ where: { tenantId } });
      expect(await count(tenantA)).toBe(0);
      expect(await count(tenantB)).toBe(1);
    });
  });

  it('answers 403 to STAFF and MANAGER on every route', async () => {
    const id = '20000000-0000-4000-8000-0000000007ff';
    for (const role of ['STAFF', 'MANAGER'] as const) {
      const headers = actorHeaders(tenantA, CUSTOMER_A, role);
      await request(app.getHttpServer()).get('/availability-alerts').set(headers).expect(403);
      await request(app.getHttpServer())
        .post('/availability-alerts')
        .set(headers)
        .send(weeklyBody(serviceA))
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/availability-alerts/${id}`)
        .set(headers)
        .send({ durationMinutes: 30 })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/availability-alerts/${id}`)
        .set(headers)
        .expect(403);
    }
    expect(
      await ds.getRepository(AvailabilityAlertEntity).count({ where: { tenantId: tenantA } }),
    ).toBe(0);
  });

  it('refuses to edit or cancel an ACTIVE alert already past its expiry (409), leaving it ACTIVE', async () => {
    const stale = new AvailabilityAlertEntityBuilder()
      .withTenantId(tenantA)
      .withServiceId(serviceA)
      .withCustomerId(CUSTOMER_A)
      .withExpiresAt(new Date(Date.now() - 3_600_000))
      .build();
    await ds.getRepository(AvailabilityAlertEntity).save(stale);
    const url = `/availability-alerts/${stale.id}`;

    await request(app.getHttpServer()).delete(url).set(as(tenantA, CUSTOMER_A)).expect(409);
    await request(app.getHttpServer())
      .patch(url)
      .set(as(tenantA, CUSTOMER_A))
      .send({ durationMinutes: 30 })
      .expect(409);

    const row = await ds
      .getRepository(AvailabilityAlertEntity)
      .findOneByOrFail({ tenantId: tenantA, id: stale.id });
    expect(row.status).toBe('ACTIVE');
    expect(row.version).toBe(1);
  });
});
