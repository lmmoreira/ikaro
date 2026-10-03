import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { nextWeekday } from '../../../../test/utils/date-helpers';
import { seedOccupiedBlock } from '../../../../test/utils/seed-resource-occupancy';
import { PlatformModule } from '../../../platform/platform.module';
import { ResourceType } from '../../domain/resource.types';

const TEST_KEY = 'availability-pinned-integ-key-xxxxx'; // 36 chars
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';
const MONDAY = nextWeekday(1);

const guest = (tenantId: string) => ({
  'x-tenant-id': tenantId,
  'x-correlation-id': 'test-correlation-id',
});
const at = (time: string) => new Date(`${MONDAY}T${time}.000Z`).toISOString();

describe('Availability with pinned selections and a chosen duration (integration, M23-S29)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantA: string;
  let tenantB: string;
  let serviceId: string;
  let roomOne: string;
  let roomTwo: string;
  let equipment: string;
  let foreignRoom: string;

  async function provisionTenant(slug: string): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: slug,
        slug,
        adminEmail: `${slug}@availability-pinned.test`,
        country_code: 'BR',
      })
      .expect(201);
    return body.tenantId as string;
  }

  async function createResource(tenantId: string, type: string, name: string): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/resources')
      .set(actorHeaders(tenantId, MANAGER_ID))
      .send({ type, name })
      .expect(201);
    return body.id as string;
  }

  const availability = (query: string, tenantId = tenantA) =>
    request(app.getHttpServer()).get(`/schedule/availability?${query}`).set(guest(tenantId));
  const startsAt = (body: { slots: { startsAt: string }[] }) => body.slots.map((s) => s.startsAt);
  const pin = (type: string, resourceId: string) => `${serviceId}:-:${type}:${resourceId}`;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));
    tenantA = await provisionTenant('avail-pinned-a');
    tenantB = await provisionTenant('avail-pinned-b');

    roomOne = await createResource(tenantA, 'ROOM', 'Sala 1');
    roomTwo = await createResource(tenantA, 'ROOM', 'Sala 2');
    equipment = await createResource(tenantA, 'EQUIPMENT', 'Máquina 1');
    foreignRoom = await createResource(tenantB, 'ROOM', 'Sala do outro tenant');

    const { body: service } = await request(app.getHttpServer())
      .post('/services')
      .set(actorHeaders(tenantA, MANAGER_ID))
      .send({
        name: 'Sala + Máquina',
        description: 'Bundle com sala escolhida pelo cliente',
        priceAmount: 100,
        durationMinutes: 60,
        loyaltyPointsValue: 1,
        requiresPickupAddress: false,
      })
      .expect(201);
    serviceId = service.id as string;
    await request(app.getHttpServer())
      .patch(`/services/${serviceId}/resource-requirements`)
      .set(actorHeaders(tenantA, MANAGER_ID))
      .send({
        resourceRequirements: [
          { type: 'ROOM', selectionMode: 'CUSTOMER_CHOICE' },
          { type: 'EQUIPMENT', selectionMode: 'AUTO_ANY' },
        ],
      })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/services/${serviceId}`)
      .set(actorHeaders(tenantA, MANAGER_ID))
      .send({ bufferAfterMinutes: 0 })
      .expect(200);

    // Sala 1 is busy 12:00Z-13:00Z; the shared equipment is busy 13:00Z-14:00Z.
    await seedOccupiedBlock(
      ds,
      tenantA,
      roomOne,
      ResourceType.ROOM,
      'COMMITTED',
      new Date(`${MONDAY}T12:00:00.000Z`),
      new Date(`${MONDAY}T13:00:00.000Z`),
    );
    await seedOccupiedBlock(
      ds,
      tenantA,
      equipment,
      ResourceType.EQUIPMENT,
      'COMMITTED',
      new Date(`${MONDAY}T13:00:00.000Z`),
      new Date(`${MONDAY}T14:00:00.000Z`),
    );
  });

  afterAll(async () => {
    delete process.env['PLATFORM_ADMIN_KEY'];
    await app.close();
  });

  it('a pinned room removes only the slots where that room conflicts', async () => {
    const unpinned = await availability(`date=${MONDAY}&serviceIds=${serviceId}`).expect(200);
    const pinnedBusyRoom = await availability(
      `date=${MONDAY}&serviceIds=${serviceId}&resourceSelections=${pin('ROOM', roomOne)}`,
    ).expect(200);
    const pinnedFreeRoom = await availability(
      `date=${MONDAY}&serviceIds=${serviceId}&resourceSelections=${pin('ROOM', roomTwo)}`,
    ).expect(200);

    expect(startsAt(unpinned.body)).toContain(at('12:00:00'));
    expect(startsAt(pinnedBusyRoom.body)).not.toContain(at('12:00:00'));
    expect(startsAt(pinnedFreeRoom.body)).toContain(at('12:00:00'));
  });

  it('still intersects with the automatic bundle resource — a conflict on the equipment removes the slot for any pinned room', async () => {
    const pinnedFreeRoom = await availability(
      `date=${MONDAY}&serviceIds=${serviceId}&resourceSelections=${pin('ROOM', roomTwo)}`,
    ).expect(200);

    expect(startsAt(pinnedFreeRoom.body)).not.toContain(at('13:00:00'));
  });

  it('the explicit resourceId view is unchanged: it ignores the service requirements and the equipment conflict', async () => {
    const { body } = await availability(
      `date=${MONDAY}&serviceIds=${serviceId}&resourceId=${roomOne}`,
    ).expect(200);

    expect(startsAt(body)).not.toContain(at('12:00:00'));
    expect(startsAt(body)).toContain(at('13:00:00'));
  });

  it('returns 400 when resourceId and resourceSelections are combined', async () => {
    const { body } = await availability(
      `date=${MONDAY}&serviceIds=${serviceId}&resourceId=${roomOne}&resourceSelections=${pin('ROOM', roomTwo)}`,
    ).expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 400 for a malformed resourceSelections item', async () => {
    const { body } = await availability(
      `date=${MONDAY}&serviceIds=${serviceId}&resourceSelections=not-a-selection`,
    ).expect(400);

    expect(body.status).toBe(400);
  });

  it('returns 422 for a selection that is not a CUSTOMER_CHOICE requirement of the service', async () => {
    const { body } = await availability(
      `date=${MONDAY}&serviceIds=${serviceId}&resourceSelections=${pin('EQUIPMENT', equipment)}`,
    ).expect(422);

    expect(body.code ?? body.type).toBeDefined();
  });

  it('tenant isolation: another tenant’s resource in resourceSelections is rejected with 422', async () => {
    const { body } = await availability(
      `date=${MONDAY}&serviceIds=${serviceId}&resourceSelections=${pin('ROOM', foreignRoom)}`,
    ).expect(422);

    expect(body.status).toBe(422);
  });

  it('the summary honours the same pins: a fully blocked pinned room empties the day while the unpinned day stays open', async () => {
    const blockedRoom = await createResource(tenantA, 'ROOM', 'Sala bloqueada');
    await seedOccupiedBlock(
      ds,
      tenantA,
      blockedRoom,
      ResourceType.ROOM,
      'COMMITTED',
      new Date(`${MONDAY}T00:00:00.000Z`),
      new Date(`${MONDAY}T23:59:00.000Z`),
    );
    const range = `from=${MONDAY}&to=${MONDAY}&serviceIds=${serviceId}`;

    const unpinned = await request(app.getHttpServer())
      .get(`/schedule/availability/summary?${range}`)
      .set(guest(tenantA))
      .expect(200);
    const pinned = await request(app.getHttpServer())
      .get(`/schedule/availability/summary?${range}&resourceSelections=${pin('ROOM', blockedRoom)}`)
      .set(guest(tenantA))
      .expect(200);

    expect(unpinned.body[0].available).toBe(true);
    expect(pinned.body[0]).toEqual({ date: MONDAY, available: false, slotCount: 0 });
  });
});
