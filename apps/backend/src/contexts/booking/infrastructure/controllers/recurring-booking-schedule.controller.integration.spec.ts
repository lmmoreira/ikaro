import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  BookingLineResourceAssignmentEntityBuilder,
  RecurringBookingScheduleEntityBuilder,
  ResourceEntityBuilder,
  ResourceOccupancyEntityBuilder,
  ServiceEntityBuilder,
  ServiceResourceRequirementEntityBuilder,
  ServiceResourceRequirementPoolEntityBuilder,
} from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { addDays, nextWeekday } from '../../../../test/utils/date-helpers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { PlatformModule } from '../../../platform/platform.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { ServiceEntity } from '../entities/service.entity';
import {
  ServiceResourceRequirementEntity,
  ServiceResourceRequirementPoolEntity,
} from '../entities/service-resource-requirement.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { ResourceType } from '../../domain/resource.types';

const TEST_KEY = 'recur-integ-test-key-booking-xxx'; // 36 chars
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000601';

describe('RecurringBookingScheduleController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantId: string;
  let resourceId: string;

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));

    const { body: tenant } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({
        name: 'Recurring Tenant A',
        slug: 'recurring-tenant-a',
        adminEmail: 'a@recurring.test',
        country_code: 'BR',
      })
      .expect(201);
    tenantId = tenant.tenantId as string;

    const customer = new CustomerEntityBuilder()
      .withTenantId(tenantId)
      .withId(CUSTOMER_ID)
      .withEmail('ana@recurring.test')
      .withName('Ana Souza')
      .withPhone('+5531999999999')
      .build();
    await ds.getRepository(CustomerEntity).save(customer);

    const resource = new ResourceEntityBuilder()
      .withTenantId(tenantId)
      .withType(ResourceType.ROOM)
      .withName('Sala Aurora')
      .build();
    await ds.getRepository(ResourceEntity).save(resource);
    resourceId = resource.id;
  });

  afterAll(async () => {
    await ds.getRepository(RecurringBookingScheduleResourceAssignmentEntity).delete({ tenantId });
    await ds.getRepository(RecurringBookingScheduleEntity).delete({ tenantId });
    await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId });
    await ds.getRepository(BookingLineResourceAssignmentEntity).delete({ tenantId });
    await ds.getRepository(BookingLineEntity).delete({ tenantId });
    await ds.getRepository(BookingEntity).delete({ tenantId });
    await ds.getRepository(ServiceResourceRequirementPoolEntity).delete({ tenantId });
    await ds.getRepository(ServiceResourceRequirementEntity).delete({ tenantId });
    await ds.getRepository(ResourceEntity).delete({ tenantId });
    await ds.getRepository(ServiceEntity).delete({ tenantId });
    await ds.getRepository(CustomerEntity).delete({ tenantId });
    await app.close();
  });

  async function seedService(
    defaultApprovalMode: 'AUTO_CONFIRM' | 'MANUAL_APPROVAL',
    selectionMode: 'CUSTOMER_CHOICE' | 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL' = 'CUSTOMER_CHOICE',
    options: {
      resourceType?: ResourceType;
      poolResourceIds?: string[];
      bufferAfterMinutes?: number;
    } = {},
  ): Promise<string> {
    const service = new ServiceEntityBuilder()
      .withTenantId(tenantId)
      .withName('Sala Aurora — reserva')
      .withRecurrenceEligible(true)
      .withDefaultApprovalMode(defaultApprovalMode)
      .withBufferAfterMinutes(options.bufferAfterMinutes ?? 60)
      .build();
    const saved = await ds.getRepository(ServiceEntity).save(service);
    const requirement = new ServiceResourceRequirementEntityBuilder()
      .withTenantId(tenantId)
      .withServiceId(saved.id)
      .withResourceType(options.resourceType ?? ResourceType.ROOM)
      .withSelectionMode(selectionMode)
      .build();
    await ds.getRepository(ServiceResourceRequirementEntity).save(requirement);
    if (options.poolResourceIds?.length) {
      await ds
        .getRepository(ServiceResourceRequirementPoolEntity)
        .save(
          options.poolResourceIds.map((poolResourceId) =>
            new ServiceResourceRequirementPoolEntityBuilder()
              .withTenantId(tenantId)
              .withRequirementId(requirement.id)
              .withResourceId(poolResourceId)
              .build(),
          ),
        );
    }
    return saved.id;
  }

  it('POST /recurring-booking-schedules persists ACTIVE with zero occurrences for AUTO_CONFIRM', async () => {
    const serviceId = await seedService('AUTO_CONFIRM');

    const { body } = await request(app.getHttpServer())
      .post('/recurring-booking-schedules')
      .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
      .send({
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: '10:00',
          durationMinutes: 60,
        },
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        startsOn: nextWeekday(2),
      })
      .expect(201);

    expect(body.status).toBe('ACTIVE');
    const occupancyCount = await ds
      .getRepository(ResourceOccupancyEntity)
      .count({ where: { tenantId } });
    expect(occupancyCount).toBe(0);
  });

  it('POST /recurring-booking-schedules persists PENDING_APPROVAL for MANUAL_APPROVAL, no resource_occupancy rows', async () => {
    const serviceId = await seedService('MANUAL_APPROVAL');

    const { body } = await request(app.getHttpServer())
      .post('/recurring-booking-schedules')
      .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
      .send({
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['wednesday'],
          startTime: '11:00',
          durationMinutes: 60,
        },
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
        startsOn: nextWeekday(3),
      })
      .expect(201);

    expect(body.status).toBe('PENDING_APPROVAL');
    expect(body.approvalHoldExpiresAt).toBeDefined();
    const occupancyCount = await ds
      .getRepository(ResourceOccupancyEntity)
      .count({ where: { tenantId } });
    expect(occupancyCount).toBe(0);
  });

  it('never crosses tenant/customer boundary on GET', async () => {
    const otherCustomerId = '20000000-0000-4000-8000-000000000602';
    const otherCustomer = new CustomerEntityBuilder()
      .withTenantId(tenantId)
      .withId(otherCustomerId)
      .withGoogleOAuthId('google-sub-recurring-other-customer')
      .withEmail('other@recurring.test')
      .withName('Outro Cliente')
      .withPhone('+5531988888888')
      .build();
    await ds.getRepository(CustomerEntity).save(otherCustomer);
    const otherScheduleServiceId = await seedService('AUTO_CONFIRM');
    const otherSchedule = new RecurringBookingScheduleEntityBuilder()
      .withTenantId(tenantId)
      .withCustomerId(otherCustomerId)
      .withServiceId(otherScheduleServiceId)
      .build();
    await ds.getRepository(RecurringBookingScheduleEntity).save(otherSchedule);

    const { body } = await request(app.getHttpServer())
      .get('/recurring-booking-schedules')
      .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
      .expect(200);

    expect(body.items.length).toBeGreaterThan(0);
    expect(
      body.items.every((item: { customerId: string }) => item.customerId === CUSTOMER_ID),
    ).toBe(true);
  });

  it('two concurrent RESOLVE_PER_OCCURRENCE requests near the per-service cap serialize correctly — only the over-cap one is rejected', async () => {
    const serviceId = await seedService('AUTO_CONFIRM', 'AUTO_ANY');
    const nearCapEntities = Array.from({ length: 49 }, () =>
      new RecurringBookingScheduleEntityBuilder()
        .withTenantId(tenantId)
        .withServiceId(serviceId)
        .withAssignmentPolicy('RESOLVE_PER_OCCURRENCE')
        .withStatus('ACTIVE')
        .build(),
    );
    await ds.getRepository(RecurringBookingScheduleEntity).save(nearCapEntities);

    const requestBody = {
      serviceId,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['thursday'],
        startTime: '09:00',
        durationMinutes: 30,
      },
      assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      startsOn: nextWeekday(4),
    };

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/recurring-booking-schedules')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .send(requestBody),
      request(app.getHttpServer())
        .post('/recurring-booking-schedules')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .send(requestBody),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
  });
  // Real composite FKs require a genuinely persisted service + booking + line + assignment before
  // a resource_occupancy row can reference one.
  async function seedOccupancy(
    occupiedResourceId: string,
    startsAt: Date,
    options: { lockState?: 'COMMITTED' | 'HOLD' | 'REQUESTED'; resourceType?: ResourceType } = {},
  ): Promise<void> {
    const lockState = options.lockState ?? 'COMMITTED';
    const resourceType = options.resourceType ?? ResourceType.ROOM;
    const service = new ServiceEntityBuilder().withTenantId(tenantId).build();
    await ds.getRepository(ServiceEntity).save(service);
    const booking = new BookingEntityBuilder().withTenantId(tenantId).build();
    await ds.getRepository(BookingEntity).save(booking);
    const line = new BookingLineEntityBuilder()
      .withTenantId(tenantId)
      .withBookingId(booking.id)
      .withServiceId(service.id)
      .build();
    await ds.getRepository(BookingLineEntity).save(line);
    const assignment = new BookingLineResourceAssignmentEntityBuilder()
      .withTenantId(tenantId)
      .withBookingLineId(line.lineId)
      .withResourceId(occupiedResourceId)
      .withResourceType(resourceType)
      .build();
    await ds.getRepository(BookingLineResourceAssignmentEntity).save(assignment);
    const occupancy = new ResourceOccupancyEntityBuilder()
      .withTenantId(tenantId)
      .withResourceId(occupiedResourceId)
      .withResourceType(resourceType)
      .withBookingLineResourceAssignmentId(assignment.id)
      .withLockState(lockState)
      .withHoldExpiresAt(lockState === 'HOLD' ? new Date(Date.now() + 30 * 60_000) : null)
      .withStartsAt(startsAt)
      .withEndsAt(new Date(startsAt.getTime() + 60 * 60_000))
      .build();
    await ds.getRepository(ResourceOccupancyEntity).save(occupancy);
  }

  // Fridays at 15:00 local (UTC-3, no DST) — a weekday/time no other test in this file books on the
  // shared resource, so a 409 here can only come from the seeded occupancy row, never from an
  // active-schedule overlap with an earlier test. Index 0 is the first Friday from today.
  function fridayOccurrence(index: number): Date {
    return new Date(`${addDays(nextWeekday(5), index * 7)}T18:00:00.000Z`);
  }

  function postFridayPattern({
    daysOfWeek = ['friday'],
    ...body
  }: {
    serviceId: string;
    assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE';
    resourceIds?: string[];
    daysOfWeek?: string[];
  }) {
    return request(app.getHttpServer())
      .post('/recurring-booking-schedules')
      .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
      .send({
        ...body,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek,
          startTime: '15:00',
          durationMinutes: 60,
        },
        startsOn: nextWeekday(5),
      });
  }

  describe('creation-time conflict check across the whole pattern', () => {
    afterEach(async () => {
      await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId });
    });

    it('FIXED_ASSIGNMENT: rejects with 409 and persists nothing when only the 5th occurrence overlaps existing occupancy', async () => {
      const serviceId = await seedService('AUTO_CONFIRM');
      await seedOccupancy(resourceId, fridayOccurrence(4));

      await postFridayPattern({
        serviceId,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
      }).expect(409);

      expect(
        await ds
          .getRepository(RecurringBookingScheduleEntity)
          .count({ where: { tenantId, serviceId } }),
      ).toBe(0);
    });

    it('FIXED_ASSIGNMENT: creates the schedule when the resource is only busy outside every occurrence', async () => {
      const serviceId = await seedService('AUTO_CONFIRM');
      await seedOccupancy(resourceId, new Date(fridayOccurrence(4).getTime() + 3 * 60 * 60_000));

      const { body } = await postFridayPattern({
        serviceId,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [resourceId],
      }).expect(201);

      expect(body.status).toBe('ACTIVE');
      expect(
        await ds
          .getRepository(RecurringBookingScheduleEntity)
          .count({ where: { tenantId, serviceId } }),
      ).toBe(1);
    });

    it('AUTO_ANY: rejects with 409 when every eligible resource is busy on one occurrence', async () => {
      const serviceId = await seedService('AUTO_CONFIRM', 'AUTO_ANY');
      await seedOccupancy(resourceId, fridayOccurrence(2));

      await postFridayPattern({ serviceId, assignmentPolicy: 'RESOLVE_PER_OCCURRENCE' }).expect(
        409,
      );

      expect(
        await ds
          .getRepository(RecurringBookingScheduleEntity)
          .count({ where: { tenantId, serviceId } }),
      ).toBe(0);
    });

    it('AUTO_ANY: creates the schedule while another eligible resource is free on the busy occurrence', async () => {
      const serviceId = await seedService('AUTO_CONFIRM', 'AUTO_ANY');
      const spare = new ResourceEntityBuilder()
        .withTenantId(tenantId)
        .withType(ResourceType.ROOM)
        .withName('Sala Boreal')
        .build();
      await ds.getRepository(ResourceEntity).save(spare);
      await seedOccupancy(resourceId, fridayOccurrence(2));

      const { body } = await postFridayPattern({
        serviceId,
        assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      }).expect(201);

      expect(body.status).toBe('ACTIVE');
      expect(
        await ds
          .getRepository(RecurringBookingScheduleEntity)
          .count({ where: { tenantId, serviceId } }),
      ).toBe(1);
    });
  });
  describe('resource kinds, states and edge cases', () => {
    const EVERY_DAY = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];

    afterEach(async () => {
      await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId });
    });

    async function saveResource(
      type: ResourceType,
      options: { isActive?: boolean; turnoverMinutes?: number } = {},
    ): Promise<string> {
      const resource = new ResourceEntityBuilder()
        .withTenantId(tenantId)
        .withType(type)
        .withName(`Recurso ${uuidv7()}`)
        .withRefId(type === ResourceType.STAFF ? uuidv7() : null)
        .withIsActive(options.isActive ?? true)
        .withTurnoverMinutes(options.turnoverMinutes ?? 0)
        .build();
      await ds.getRepository(ResourceEntity).save(resource);
      return resource.id;
    }

    async function occupyEveryActive(type: ResourceType, startsAt: Date): Promise<void> {
      const resources = await ds
        .getRepository(ResourceEntity)
        .find({ where: { tenantId, type, isActive: true } });
      for (const resource of resources) {
        await seedOccupancy(resource.id, startsAt, { resourceType: type });
      }
    }

    async function scheduleCount(serviceId: string): Promise<number> {
      return ds
        .getRepository(RecurringBookingScheduleEntity)
        .count({ where: { tenantId, serviceId } });
    }

    it.each([ResourceType.STAFF, ResourceType.EQUIPMENT])(
      'FIXED_ASSIGNMENT with a %s resource: 409 when a later occurrence overlaps, 201 with a free resource',
      async (type) => {
        const serviceId = await seedService('AUTO_CONFIRM', 'CUSTOMER_CHOICE', {
          resourceType: type,
        });
        const busy = await saveResource(type);
        await seedOccupancy(busy, fridayOccurrence(3), { resourceType: type });

        await postFridayPattern({
          serviceId,
          assignmentPolicy: 'FIXED_ASSIGNMENT',
          resourceIds: [busy],
        }).expect(409);
        expect(await scheduleCount(serviceId)).toBe(0);

        const free = await saveResource(type);
        const { body } = await postFridayPattern({
          serviceId,
          assignmentPolicy: 'FIXED_ASSIGNMENT',
          resourceIds: [free],
        }).expect(201);

        expect(body.status).toBe('ACTIVE');
        expect(await scheduleCount(serviceId)).toBe(1);
      },
    );

    it('AUTO_FUNGIBLE_POOL over EQUIPMENT: 409 when the whole pool is busy on one occurrence, 201 once it is free', async () => {
      const serviceId = await seedService('AUTO_CONFIRM', 'AUTO_FUNGIBLE_POOL', {
        resourceType: ResourceType.EQUIPMENT,
      });
      await saveResource(ResourceType.EQUIPMENT);
      await saveResource(ResourceType.EQUIPMENT);
      await occupyEveryActive(ResourceType.EQUIPMENT, fridayOccurrence(2));

      await postFridayPattern({ serviceId, assignmentPolicy: 'RESOLVE_PER_OCCURRENCE' }).expect(
        409,
      );
      expect(await scheduleCount(serviceId)).toBe(0);

      await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId });
      const { body } = await postFridayPattern({
        serviceId,
        assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      }).expect(201);

      expect(body.status).toBe('ACTIVE');
      expect(await scheduleCount(serviceId)).toBe(1);
    });

    it('AUTO_ANY over STAFF: an inactive staff resource is never counted as free', async () => {
      const serviceId = await seedService('AUTO_CONFIRM', 'AUTO_ANY', {
        resourceType: ResourceType.STAFF,
      });
      await saveResource(ResourceType.STAFF);
      await saveResource(ResourceType.STAFF, { isActive: false });
      await occupyEveryActive(ResourceType.STAFF, fridayOccurrence(1));

      await postFridayPattern({ serviceId, assignmentPolicy: 'RESOLVE_PER_OCCURRENCE' }).expect(
        409,
      );

      expect(await scheduleCount(serviceId)).toBe(0);
    });

    it('AUTO_ANY with a pool: only pool members count, even when another room is free', async () => {
      const poolA = await saveResource(ResourceType.ROOM);
      const poolB = await saveResource(ResourceType.ROOM);
      await saveResource(ResourceType.ROOM);
      const serviceId = await seedService('AUTO_CONFIRM', 'AUTO_ANY', {
        poolResourceIds: [poolA, poolB],
      });
      await seedOccupancy(poolA, fridayOccurrence(2));
      await seedOccupancy(poolB, fridayOccurrence(2));

      await postFridayPattern({ serviceId, assignmentPolicy: 'RESOLVE_PER_OCCURRENCE' }).expect(
        409,
      );
      expect(await scheduleCount(serviceId)).toBe(0);

      await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId, resourceId: poolB });
      const { body } = await postFridayPattern({
        serviceId,
        assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      }).expect(201);

      expect(body.status).toBe('ACTIVE');
      expect(await scheduleCount(serviceId)).toBe(1);
    });

    it('FIXED_ASSIGNMENT with a deactivated resource is rejected as unavailable (422), not as a conflict', async () => {
      const serviceId = await seedService('AUTO_CONFIRM', 'CUSTOMER_CHOICE', {
        resourceType: ResourceType.STAFF,
      });
      const inactive = await saveResource(ResourceType.STAFF, { isActive: false });

      await postFridayPattern({
        serviceId,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [inactive],
      }).expect(422);

      expect(await scheduleCount(serviceId)).toBe(0);
    });

    it('a HOLD occupancy row blocks the occurrence, a REQUESTED row does not', async () => {
      const serviceId = await seedService('AUTO_CONFIRM', 'CUSTOMER_CHOICE', {
        resourceType: ResourceType.EQUIPMENT,
      });
      const equipment = await saveResource(ResourceType.EQUIPMENT);
      await seedOccupancy(equipment, fridayOccurrence(2), {
        resourceType: ResourceType.EQUIPMENT,
        lockState: 'HOLD',
      });

      await postFridayPattern({
        serviceId,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [equipment],
      }).expect(409);

      await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId });
      await seedOccupancy(equipment, fridayOccurrence(2), {
        resourceType: ResourceType.EQUIPMENT,
        lockState: 'REQUESTED',
      });
      const { body } = await postFridayPattern({
        serviceId,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [equipment],
      }).expect(201);

      expect(body.status).toBe('ACTIVE');
    });

    it("extends each occurrence by the resource's own turnover gap", async () => {
      const serviceId = await seedService('AUTO_CONFIRM', 'CUSTOMER_CHOICE', {
        resourceType: ResourceType.EQUIPMENT,
        bufferAfterMinutes: 0,
      });
      const withTurnover = await saveResource(ResourceType.EQUIPMENT, { turnoverMinutes: 30 });
      const withoutTurnover = await saveResource(ResourceType.EQUIPMENT);
      const fifteenMinutesAfterEnd = new Date(fridayOccurrence(1).getTime() + 75 * 60_000);
      await seedOccupancy(withTurnover, fifteenMinutesAfterEnd, {
        resourceType: ResourceType.EQUIPMENT,
      });
      await seedOccupancy(withoutTurnover, fifteenMinutesAfterEnd, {
        resourceType: ResourceType.EQUIPMENT,
      });

      const blocked = await postFridayPattern({
        serviceId,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [withTurnover],
      });
      const accepted = await postFridayPattern({
        serviceId,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [withoutTurnover],
      });

      expect(blocked.status).toBe(409);
      expect(accepted.status).toBe(201);
      expect(await scheduleCount(serviceId)).toBe(1);
    });

    it('a 90-day daily pattern: 409 when only the 60th day overlaps, 201 otherwise', async () => {
      const serviceId = await seedService('AUTO_CONFIRM', 'CUSTOMER_CHOICE', {
        resourceType: ResourceType.EQUIPMENT,
      });
      const busy = await saveResource(ResourceType.EQUIPMENT);
      const sixtiethDay = new Date(`${addDays(nextWeekday(5), 59)}T18:00:00.000Z`);
      await seedOccupancy(busy, sixtiethDay, { resourceType: ResourceType.EQUIPMENT });

      await postFridayPattern({
        serviceId,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [busy],
        daysOfWeek: EVERY_DAY,
      }).expect(409);
      expect(await scheduleCount(serviceId)).toBe(0);

      const free = await saveResource(ResourceType.EQUIPMENT);
      await postFridayPattern({
        serviceId,
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [free],
        daysOfWeek: EVERY_DAY,
      }).expect(201);
      expect(await scheduleCount(serviceId)).toBe(1);
    });

    it('two concurrent identical FIXED_ASSIGNMENT requests on one resource serialize: exactly one is created', async () => {
      const serviceId = await seedService('AUTO_CONFIRM', 'CUSTOMER_CHOICE', {
        resourceType: ResourceType.EQUIPMENT,
      });
      const equipment = await saveResource(ResourceType.EQUIPMENT);
      const body = {
        serviceId,
        assignmentPolicy: 'FIXED_ASSIGNMENT' as const,
        resourceIds: [equipment],
      };

      const [first, second] = await Promise.all([postFridayPattern(body), postFridayPattern(body)]);

      expect([first.status, second.status].sort((a, b) => a - b)).toEqual([201, 409]);
      expect(await scheduleCount(serviceId)).toBe(1);
    });

    it('concurrent AUTO_ANY requests over the same resources all succeed without deadlocking', async () => {
      await saveResource(ResourceType.EQUIPMENT);
      await saveResource(ResourceType.EQUIPMENT);
      const serviceIds = await Promise.all(
        Array.from({ length: 4 }, () =>
          seedService('AUTO_CONFIRM', 'AUTO_ANY', { resourceType: ResourceType.EQUIPMENT }),
        ),
      );

      const responses = await Promise.all(
        serviceIds.map((serviceId) =>
          postFridayPattern({ serviceId, assignmentPolicy: 'RESOLVE_PER_OCCURRENCE' }),
        ),
      );

      expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 201]);
    });
  });
});
