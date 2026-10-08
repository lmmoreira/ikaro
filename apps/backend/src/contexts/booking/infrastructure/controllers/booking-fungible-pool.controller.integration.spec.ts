import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { PlatformModule } from '../../../platform/platform.module';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';

const TEST_KEY = 'booking-integ-test-key-pool-xxxxxxxx'; // 36 chars
const ACTOR_ID = '20000000-0000-4000-8000-000000000a01';

function guestHeaders(tenantId: string) {
  return { 'x-tenant-id': tenantId, 'x-correlation-id': '01980000-0000-7000-8000-0000000000d1' };
}

// UC-062: a pool of interchangeable units books the same slot until its units run out, each
// booking taking a distinct free unit — including when the bookings arrive at the same time.
describe('BookingController — AUTO_FUNGIBLE_POOL (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantAId: string;
  let tenantBId: string;
  let slotCounter = 0;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));
    // Slugs and emails are unique per run: the tenants are never deleted, and a reused database
    // would otherwise refuse the second run's fixed slug.
    const run = Date.now().toString(36);
    tenantAId = await createTenant('Pool Tenant A', `pool-a-${run}`, `a-${run}@pool.test`);
    tenantBId = await createTenant('Pool Tenant B', `pool-b-${run}`, `b-${run}@pool.test`);
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  async function createTenant(name: string, slug: string, adminEmail: string): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({ name, slug, adminEmail, country_code: 'BR' })
      .expect(201);
    return body.tenantId as string;
  }

  async function createRoom(tenantId: string, name: string): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/resources')
      .set(actorHeaders(tenantId, ACTOR_ID))
      .send({ type: 'ROOM', name })
      .expect(201);
    return body.id as string;
  }

  async function createPoolService(
    tenantId: string,
    roomIds: string[],
    requiredQuantity = 1,
  ): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/services')
      .set(actorHeaders(tenantId, ACTOR_ID))
      .send({
        name: 'Aluguel de Quadra',
        description: 'Descrição',
        priceAmount: 100,
        durationMinutes: 30,
        loyaltyPointsValue: 5,
        requiresPickupAddress: false,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/services/${body.id}/resource-requirements`)
      .set(actorHeaders(tenantId, ACTOR_ID))
      .send({
        resourceRequirements: [
          {
            type: 'ROOM',
            selectionMode: 'AUTO_FUNGIBLE_POOL',
            resourcePoolIds: roomIds,
            requiredQuantity,
          },
        ],
      })
      .expect(200);
    return body.id as string;
  }

  // A distinct open weekday (Wednesday, 10:00 local) per test, so one test's bookings never
  // contend with another's slot.
  const nextSlot = (): string => `${nextWeekday(3, 3 + slotCounter++)}T13:00:00.000Z`;

  const book = (tenantId: string, serviceId: string, scheduledAt: string, email: string) =>
    request(app.getHttpServer())
      .post('/bookings')
      .set(guestHeaders(tenantId))
      .send({
        contactEmail: email,
        contactName: 'João Silva',
        contactPhone: '+5531999999999',
        scheduledAt,
        serviceIds: [serviceId],
      });

  const offersSlot = async (
    tenantId: string,
    serviceId: string,
    scheduledAt: string,
  ): Promise<boolean> => {
    const { body } = await request(app.getHttpServer())
      .get(`/schedule/availability?date=${scheduledAt.slice(0, 10)}&serviceIds=${serviceId}`)
      .set(guestHeaders(tenantId))
      .expect(200);
    return (body.slots as { startsAt: string }[]).some(
      (slot) => new Date(slot.startsAt).getTime() === new Date(scheduledAt).getTime(),
    );
  };

  // The resources holding the slot: one occupancy row per unit a booking took.
  const occupiedResourceIds = async (
    tenantId: string,
    roomIds: string[],
    scheduledAt: string,
  ): Promise<string[]> => {
    const rows = await ds.getRepository(ResourceOccupancyEntity).find({
      where: { tenantId, resourceId: In(roomIds), startsAt: new Date(scheduledAt) },
    });
    return rows.map((row) => row.resourceId);
  };

  it('books the same slot once per unit on distinct units, then rejects the next with 409', async () => {
    const roomA = await createRoom(tenantAId, 'Quadra 1');
    const roomB = await createRoom(tenantAId, 'Quadra 2');
    const serviceId = await createPoolService(tenantAId, [roomA, roomB]);
    const scheduledAt = nextSlot();

    const first = await book(tenantAId, serviceId, scheduledAt, 'um@pool.test').expect(201);
    expect(await offersSlot(tenantAId, serviceId, scheduledAt)).toBe(true);
    const second = await book(tenantAId, serviceId, scheduledAt, 'dois@pool.test').expect(201);
    const third = await book(tenantAId, serviceId, scheduledAt, 'tres@pool.test').expect(409);

    expect(third.body.code).toBe('BOOKING_SLOT_UNAVAILABLE');
    expect(await offersSlot(tenantAId, serviceId, scheduledAt)).toBe(false);
    expect(first.body.lines[0].assignedResourceName).toBeUndefined();
    expect(second.body.lines[0].assignedResourceName).toBeUndefined();
    const units = await occupiedResourceIds(tenantAId, [roomA, roomB], scheduledAt);
    expect([...units].sort()).toEqual([roomA, roomB].sort());
  });

  it('two simultaneous bookings of an empty 2-unit pool both succeed, on distinct units', async () => {
    const roomA = await createRoom(tenantAId, 'Quadra 5');
    const roomB = await createRoom(tenantAId, 'Quadra 6');
    const serviceId = await createPoolService(tenantAId, [roomA, roomB]);
    const scheduledAt = nextSlot();

    const results = await Promise.all([
      book(tenantAId, serviceId, scheduledAt, 'junto-1@pool.test'),
      book(tenantAId, serviceId, scheduledAt, 'junto-2@pool.test'),
    ]);

    expect(results.map((res) => res.status)).toEqual([201, 201]);
    const units = await occupiedResourceIds(tenantAId, [roomA, roomB], scheduledAt);
    expect([...units].sort()).toEqual([roomA, roomB].sort());
  });

  it('two concurrent bookings of the last free unit: one 201, one 409', async () => {
    const roomA = await createRoom(tenantAId, 'Quadra 3');
    const roomB = await createRoom(tenantAId, 'Quadra 4');
    const serviceId = await createPoolService(tenantAId, [roomA, roomB]);
    const scheduledAt = nextSlot();
    await book(tenantAId, serviceId, scheduledAt, 'primeiro@pool.test').expect(201);

    const results = await Promise.all([
      book(tenantAId, serviceId, scheduledAt, 'corrida-1@pool.test'),
      book(tenantAId, serviceId, scheduledAt, 'corrida-2@pool.test'),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
  });

  it('a pool that needs 2 of 3 units books once, then rejects the next with 409 (not a 422)', async () => {
    const rooms = [
      await createRoom(tenantAId, 'Sala 1'),
      await createRoom(tenantAId, 'Sala 2'),
      await createRoom(tenantAId, 'Sala 3'),
    ];
    const serviceId = await createPoolService(tenantAId, rooms, 2);
    const scheduledAt = nextSlot();

    await book(tenantAId, serviceId, scheduledAt, 'duas@pool.test').expect(201);
    const second = await book(tenantAId, serviceId, scheduledAt, 'duas-b@pool.test').expect(409);

    expect(second.body.code).toBe('BOOKING_SLOT_UNAVAILABLE');
    expect(await occupiedResourceIds(tenantAId, rooms, scheduledAt)).toHaveLength(2);
  });

  it("another tenant's pool is not blocked by a fully booked pool at the same slot", async () => {
    const aRoom = await createRoom(tenantAId, 'Quadra A única');
    const bRoom = await createRoom(tenantBId, 'Quadra B única');
    const serviceA = await createPoolService(tenantAId, [aRoom]);
    const serviceB = await createPoolService(tenantBId, [bRoom]);
    const scheduledAt = nextSlot();

    await book(tenantAId, serviceA, scheduledAt, 'a@pool.test').expect(201);
    await book(tenantAId, serviceA, scheduledAt, 'a2@pool.test').expect(409);
    await book(tenantBId, serviceB, scheduledAt, 'b@pool.test').expect(201);

    expect(await occupiedResourceIds(tenantBId, [bRoom], scheduledAt)).toEqual([bRoom]);
  });
});
