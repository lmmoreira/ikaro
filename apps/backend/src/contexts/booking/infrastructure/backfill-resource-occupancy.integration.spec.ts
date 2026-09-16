import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  ResourceEntityBuilder,
  ServiceEntityBuilder,
} from '../../../test/builders/booking/index';
import { TenantEntityBuilder } from '../../../test/builders/platform/tenant-entity.builder';
import { createBookingIntegrationApp } from '../../../test/utils/booking-integration-app';
import { TenantEntity } from '../../platform/infrastructure/entities/tenant.entity';
import { ResourceEntity } from './entities/resource.entity';
import { ServiceEntity } from './entities/service.entity';
import { BookingEntity } from './entities/booking.entity';
import { BookingLineEntity } from './entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from './entities/booking-line-resource-assignment.entity';
import { ResourceOccupancyEntity } from './entities/resource-occupancy.entity';
import { ResourceType } from '../domain/resource.types';
import { BackfillResourceOccupancy1748500000013 } from './migrations/1748500000013-BackfillResourceOccupancy';

// M22-S03 — direct invocation of the migration's up(queryRunner), same discipline as
// backfill-location-resources.integration.spec.ts: integration-global-setup.ts already runs
// every migration (including this one) once, up front, against an empty bookings table, so it
// no-ops before any test seeds a booking fixture.
const TENANT_A = '00000000-1113-7000-8000-000000000001';
const FUTURE_START = new Date(Date.now() + 24 * 60 * 60 * 1000);
const FUTURE_END = new Date(FUTURE_START.getTime() + 60 * 60_000);
const PAST_START = new Date(Date.now() - 48 * 60 * 60 * 1000);
const PAST_END = new Date(PAST_START.getTime() + 60 * 60_000);

describe('BackfillResourceOccupancy1748500000013 (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let migration: BackfillResourceOccupancy1748500000013;
  let locationResourceId: string;
  let approvedFutureBookingId: string;
  let approvedFutureLineId: string;
  let approvedPastLineId: string;
  let pendingBookingId: string;
  let rejectedBookingId: string;
  let multiLineFirstLineId: string;
  let multiLineSecondLineId: string;
  const MULTI_LINE_START = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const MULTI_LINE_FIRST_DURATION_MINS = 30;
  const MULTI_LINE_SECOND_DURATION_MINS = 45;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    migration = new BackfillResourceOccupancy1748500000013();

    await ds
      .getRepository(TenantEntity)
      .save(new TenantEntityBuilder().withId(TENANT_A).withSlug('backfill-occupancy-a').build());

    const location = new ResourceEntityBuilder()
      .withTenantId(TENANT_A)
      .withType(ResourceType.LOCATION)
      .build();
    await ds.getRepository(ResourceEntity).save(location);
    locationResourceId = location.id;

    const service = new ServiceEntityBuilder().withTenantId(TENANT_A).build();
    await ds.getRepository(ServiceEntity).save(service);

    async function seedBooking(status: string, scheduledAt: Date, scheduledEndAt: Date) {
      const durationMins = (scheduledEndAt.getTime() - scheduledAt.getTime()) / 60_000;
      const booking = new BookingEntityBuilder()
        .withTenantId(TENANT_A)
        .withStatus(status)
        .withScheduledAt(scheduledAt)
        .withTotalDurationMins(durationMins)
        .build();
      // BookingEntityBuilder derives scheduledEndAt from scheduledAt+totalDurationMins already —
      // matches scheduledEndAt exactly since we pass the corresponding duration above.
      await ds.getRepository(BookingEntity).save(booking);
      const line = new BookingLineEntityBuilder()
        .withTenantId(TENANT_A)
        .withBookingId(booking.id)
        .withServiceId(service.id)
        // Must match the booking's own totalDurationMins (its one line's own duration, by the
        // domain aggregate's own invariant) — the backfill now derives each line's window from
        // duration_mins_at_booking, so a mismatched fixture would silently produce a wrong window.
        .withDurationMinsAtBooking(durationMins)
        .build();
      await ds.getRepository(BookingLineEntity).save(line);
      return { bookingId: booking.id, lineId: line.lineId };
    }

    const approvedFuture = await seedBooking('APPROVED', FUTURE_START, FUTURE_END);
    approvedFutureBookingId = approvedFuture.bookingId;
    approvedFutureLineId = approvedFuture.lineId;

    approvedPastLineId = (await seedBooking('APPROVED', PAST_START, PAST_END)).lineId;
    pendingBookingId = (await seedBooking('PENDING', FUTURE_START, FUTURE_END)).bookingId;
    rejectedBookingId = (await seedBooking('REJECTED', FUTURE_START, FUTURE_END)).bookingId;

    const multiLineTotalDuration = MULTI_LINE_FIRST_DURATION_MINS + MULTI_LINE_SECOND_DURATION_MINS;
    const multiLineBooking = new BookingEntityBuilder()
      .withTenantId(TENANT_A)
      .withStatus('APPROVED')
      .withScheduledAt(MULTI_LINE_START)
      .withTotalDurationMins(multiLineTotalDuration)
      .build();
    await ds.getRepository(BookingEntity).save(multiLineBooking);
    const firstLine = new BookingLineEntityBuilder()
      .withTenantId(TENANT_A)
      .withBookingId(multiLineBooking.id)
      .withServiceId(service.id)
      .withDurationMinsAtBooking(MULTI_LINE_FIRST_DURATION_MINS)
      .build();
    await ds.getRepository(BookingLineEntity).save(firstLine);
    multiLineFirstLineId = firstLine.lineId;
    const secondLine = new BookingLineEntityBuilder()
      .withTenantId(TENANT_A)
      .withBookingId(multiLineBooking.id)
      .withServiceId(service.id)
      .withDurationMinsAtBooking(MULTI_LINE_SECOND_DURATION_MINS)
      .build();
    await ds.getRepository(BookingLineEntity).save(secondLine);
    multiLineSecondLineId = secondLine.lineId;
  });

  afterAll(async () => {
    await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId: TENANT_A });
    await ds.getRepository(BookingLineResourceAssignmentEntity).delete({ tenantId: TENANT_A });
    await ds.getRepository(BookingLineEntity).delete({ tenantId: TENANT_A });
    await ds.getRepository(BookingEntity).delete({ tenantId: TENANT_A });
    await ds.getRepository(ServiceEntity).delete({ tenantId: TENANT_A });
    await ds.getRepository(ResourceEntity).delete({ tenantId: TENANT_A });
    await ds.getRepository(TenantEntity).delete({ id: TENANT_A });
    await app.close();
  });

  async function runUp(): Promise<void> {
    const queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    try {
      await migration.up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  it('backfills exactly one assignment + COMMITTED occupancy row for an APPROVED, still-future booking', async () => {
    await runUp();

    const assignments = await ds
      .getRepository(BookingLineResourceAssignmentEntity)
      .find({ where: { tenantId: TENANT_A, bookingLineId: approvedFutureLineId } });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].resourceId).toBe(locationResourceId);
    expect(assignments[0].legIndex).toBeNull();

    const occupancy = await ds.getRepository(ResourceOccupancyEntity).find({
      where: { tenantId: TENANT_A, bookingLineResourceAssignmentId: assignments[0].id },
    });
    expect(occupancy).toHaveLength(1);
    expect(occupancy[0].lockState).toBe('COMMITTED');
    expect(occupancy[0].holdExpiresAt).toBeNull();
    expect(occupancy[0].startsAt.toISOString()).toBe(FUTURE_START.toISOString());
    expect(occupancy[0].endsAt.toISOString()).toBe(FUTURE_END.toISOString());
  });

  it('backfills an APPROVED booking whose scheduled_end_at has already passed (M22-S04 day grid dependency)', async () => {
    await runUp();

    const assignments = await ds
      .getRepository(BookingLineResourceAssignmentEntity)
      .find({ where: { tenantId: TENANT_A, bookingLineId: approvedPastLineId } });
    expect(assignments).toHaveLength(1);

    const occupancy = await ds.getRepository(ResourceOccupancyEntity).find({
      where: { tenantId: TENANT_A, bookingLineResourceAssignmentId: assignments[0].id },
    });
    expect(occupancy).toHaveLength(1);
    expect(occupancy[0].lockState).toBe('COMMITTED');
    expect(occupancy[0].startsAt.toISOString()).toBe(PAST_START.toISOString());
    expect(occupancy[0].endsAt.toISOString()).toBe(PAST_END.toISOString());
  });

  it('does not backfill a PENDING or REJECTED booking', async () => {
    await runUp();

    const allAssignments = await ds
      .getRepository(BookingLineResourceAssignmentEntity)
      .find({ where: { tenantId: TENANT_A } });
    const allBookingLines = await ds
      .getRepository(BookingLineEntity)
      .find({ where: { tenantId: TENANT_A } });
    const lineIdToBookingId = new Map(allBookingLines.map((l) => [l.lineId, l.bookingId]));
    const backfilledBookingIds = new Set(
      allAssignments.map((a) => lineIdToBookingId.get(a.bookingLineId)),
    );

    expect(backfilledBookingIds.has(pendingBookingId)).toBe(false);
    expect(backfilledBookingIds.has(rejectedBookingId)).toBe(false);
    expect(backfilledBookingIds.has(approvedFutureBookingId)).toBe(true);
  });

  it('gives each line of a multi-line APPROVED booking its own sequential, non-overlapping window on the shared LOCATION resource', async () => {
    await runUp();

    const firstAssignment = await ds
      .getRepository(BookingLineResourceAssignmentEntity)
      .findOneOrFail({ where: { tenantId: TENANT_A, bookingLineId: multiLineFirstLineId } });
    const secondAssignment = await ds
      .getRepository(BookingLineResourceAssignmentEntity)
      .findOneOrFail({ where: { tenantId: TENANT_A, bookingLineId: multiLineSecondLineId } });

    const firstOccupancy = await ds.getRepository(ResourceOccupancyEntity).findOneOrFail({
      where: { tenantId: TENANT_A, bookingLineResourceAssignmentId: firstAssignment.id },
    });
    const secondOccupancy = await ds.getRepository(ResourceOccupancyEntity).findOneOrFail({
      where: { tenantId: TENANT_A, bookingLineResourceAssignmentId: secondAssignment.id },
    });

    const firstEnd = new Date(MULTI_LINE_START.getTime() + MULTI_LINE_FIRST_DURATION_MINS * 60_000);
    const secondEnd = new Date(firstEnd.getTime() + MULTI_LINE_SECOND_DURATION_MINS * 60_000);

    expect(firstOccupancy.startsAt.toISOString()).toBe(MULTI_LINE_START.toISOString());
    expect(firstOccupancy.endsAt.toISOString()).toBe(firstEnd.toISOString());
    // The second line starts exactly where the first ends — not the whole booking's window
    // (the bug: both lines sharing scheduled_at/scheduled_end_at would overlap and violate the
    // GIST exclusion constraint on this shared LOCATION resource).
    expect(secondOccupancy.startsAt.toISOString()).toBe(firstEnd.toISOString());
    expect(secondOccupancy.endsAt.toISOString()).toBe(secondEnd.toISOString());
  });

  it('is idempotent — running twice does not duplicate rows', async () => {
    await runUp();
    await runUp();

    const assignments = await ds
      .getRepository(BookingLineResourceAssignmentEntity)
      .find({ where: { tenantId: TENANT_A, bookingLineId: approvedFutureLineId } });
    expect(assignments).toHaveLength(1);
  });
});
