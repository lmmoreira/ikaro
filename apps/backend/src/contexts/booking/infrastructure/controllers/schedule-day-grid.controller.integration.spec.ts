import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  BookingLineResourceAssignmentEntityBuilder,
  ResourceEntityBuilder,
  ResourceOccupancyEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { ResourceEntity } from '../entities/resource.entity';
import { ServiceEntity } from '../entities/service.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { ResourceType } from '../../domain/resource.types';

const TENANT_A = '10000000-0000-4000-8000-000000000500';
const TENANT_B = '10000000-0000-4000-8000-000000000501';
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';
const DATE = '2026-06-01';

describe('ScheduleDayGridController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
  });

  afterAll(async () => {
    await app.close();
  });

  // Real composite FKs require a genuinely persisted service + booking + line + assignment
  // before a resource_occupancy row can reference one — same discipline as
  // typeorm-resource-occupancy.repository.integration.spec.ts.
  async function seedOccupiedBlock(
    tenantId: string,
    resourceId: string,
    resourceType: ResourceType,
    lockState: 'REQUESTED' | 'HOLD' | 'COMMITTED',
    startsAt: Date,
    endsAt: Date,
  ): Promise<{ bookingId: string }> {
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
      .withResourceId(resourceId)
      .withResourceType(resourceType)
      .build();
    await ds.getRepository(BookingLineResourceAssignmentEntity).save(assignment);
    const occupancy = new ResourceOccupancyEntityBuilder()
      .withTenantId(tenantId)
      .withResourceId(resourceId)
      .withResourceType(resourceType)
      .withBookingLineResourceAssignmentId(assignment.id)
      .withLockState(lockState)
      .withStartsAt(startsAt)
      .withEndsAt(endsAt)
      .build();
    await ds.getRepository(ResourceOccupancyEntity).save(occupancy);
    return { bookingId: booking.id };
  }

  describe('GET /schedule/day-grid', () => {
    it('returns one column per active resource with correctly placed occupied blocks, including a REQUESTED-state booking', async () => {
      const resource = new ResourceEntityBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.ROOM)
        .withName('Estúdio 1')
        .build();
      await ds.getRepository(ResourceEntity).save(resource);

      const { bookingId } = await seedOccupiedBlock(
        TENANT_A,
        resource.id,
        ResourceType.ROOM,
        'REQUESTED',
        new Date(`${DATE}T13:00:00.000Z`),
        new Date(`${DATE}T14:00:00.000Z`),
      );

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/day-grid?date=${DATE}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      expect(body.date).toBe(DATE);
      const column = body.columns.find((c: { resourceId: string }) => c.resourceId === resource.id);
      expect(column).toBeDefined();
      expect(column.name).toBe('Estúdio 1');
      expect(column.blocks).toHaveLength(1);
      expect(column.blocks[0]).toMatchObject({
        kind: 'BOOKING',
        refId: bookingId,
      });
    });

    it('returns a valid single-column response for a tenant with fewer than 2 active resources', async () => {
      const resource = new ResourceEntityBuilder()
        .withTenantId(TENANT_B)
        .withType(ResourceType.EQUIPMENT)
        .build();
      await ds.getRepository(ResourceEntity).save(resource);

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/day-grid?date=${DATE}`)
        .set(actorHeaders(TENANT_B, MANAGER_ID))
        .expect(200);

      expect(body.columns).toHaveLength(1);
      expect(body.columns[0].blocks).toEqual([]);
    });

    it('returns 403 for STAFF role', async () => {
      const { body } = await request(app.getHttpServer())
        .get(`/schedule/day-grid?date=${DATE}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID, 'STAFF'))
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('never includes another tenant’s resources or bookings', async () => {
      const ownResource = new ResourceEntityBuilder()
        .withTenantId(TENANT_A)
        .withName('Tenant A Resource')
        .build();
      const otherResource = new ResourceEntityBuilder()
        .withTenantId(TENANT_B)
        .withName('Tenant B Resource')
        .build();
      await ds.getRepository(ResourceEntity).save([ownResource, otherResource]);

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/day-grid?date=${DATE}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      const resourceIds = body.columns.map((c: { resourceId: string }) => c.resourceId);
      expect(resourceIds).toContain(ownResource.id);
      expect(resourceIds).not.toContain(otherResource.id);
    });
  });
});
