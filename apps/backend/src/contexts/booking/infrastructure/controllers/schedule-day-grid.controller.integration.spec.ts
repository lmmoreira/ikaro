import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In } from 'typeorm';
import { CalendarDateErrorCode } from '@ikaro/types';
import { ResourceEntityBuilder } from '../../../../test/builders/booking/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { seedOccupiedBlock } from '../../../../test/utils/seed-resource-occupancy';
import { ResourceEntity } from '../entities/resource.entity';
import { ServiceEntity } from '../entities/service.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { ResourceType } from '../../domain/resource.types';

const TENANT_A = '10000000-0000-4000-8000-000000000500';
const TENANT_B = '10000000-0000-4000-8000-000000000501';
const FIXTURE_TENANT_IDS = [TENANT_A, TENANT_B];
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';
const DATE = '2026-06-01';

describe('ScheduleDayGridController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  // Deletes in FK-safe order for both fixture tenants at once — used both defensively before
  // seeding (self-heals if a prior run's afterAll never completed, e.g. under CI's
  // TESTCONTAINERS_REUSE_ENABLE) and in afterAll's own teardown, so the two never drift apart.
  async function cleanupFixtures(): Promise<void> {
    await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds
      .getRepository(BookingLineResourceAssignmentEntity)
      .delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(BookingLineEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(BookingEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(ServiceEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(ResourceEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
  }

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    await cleanupFixtures();
  });

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app.close();
    }
  });

  describe('GET /schedule/day-grid', () => {
    it('returns one column per active resource with correctly placed occupied blocks, including a REQUESTED-state booking', async () => {
      const resource = new ResourceEntityBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.ROOM)
        .withName('Estúdio 1')
        .build();
      await ds.getRepository(ResourceEntity).save(resource);

      const { bookingId } = await seedOccupiedBlock(
        ds,
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

    it('returns 400 CALENDAR_DATE_FORMAT_INVALID for a calendar-impossible date', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/schedule/day-grid?date=2026-02-30')
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(400);

      expect(body.violations).toContainEqual({
        field: 'date',
        code: CalendarDateErrorCode.FORMAT_INVALID,
      });
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

      const { bookingId: otherTenantBookingId } = await seedOccupiedBlock(
        ds,
        TENANT_B,
        otherResource.id,
        ResourceType.ROOM,
        'COMMITTED',
        new Date(`${DATE}T15:00:00.000Z`),
        new Date(`${DATE}T16:00:00.000Z`),
      );

      const { body } = await request(app.getHttpServer())
        .get(`/schedule/day-grid?date=${DATE}`)
        .set(actorHeaders(TENANT_A, MANAGER_ID))
        .expect(200);

      const resourceIds = body.columns.map((c: { resourceId: string }) => c.resourceId);
      expect(resourceIds).toContain(ownResource.id);
      expect(resourceIds).not.toContain(otherResource.id);

      const allRefIds = body.columns.flatMap((c: { blocks: { refId: string }[] }) =>
        c.blocks.map((b) => b.refId),
      );
      expect(allRefIds).not.toContain(otherTenantBookingId);
    });
  });
});
