import { Inject, Injectable } from '@nestjs/common';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import { ResourceDeactivationImpactRaised } from '../../domain/events/resource-deactivation-impact-raised.event';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
  ResourceBookingImpact,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { computeBookingAlternatives } from '../use-cases/future-commitment-alternatives.helpers';
import { raiseFutureCommitmentException } from '../use-cases/future-commitment-exception-raise.helpers';
import { mapSequentially } from '../../../../shared/utils/sequential';

export interface RaiseFutureCommitmentExceptionsForResourceInput {
  tenantId: string;
  resourceId: string;
  correlationId: string;
}

export interface RaiseFutureCommitmentExceptionsForResourceResult {
  raisedCount: number;
}

// Bookings that still represent a commitment the manager must decide on. A terminal booking's
// occupancy is normally released already; this also guards a COMPLETED one whose window is still
// in the future.
const LIVE_BOOKING_STATUSES: ReadonlySet<BookingStatus> = new Set([
  BookingStatus.PENDING,
  BookingStatus.INFO_REQUESTED,
  BookingStatus.APPROVED,
]);

// UC-073 — the shared raise step for a resource deactivation, called from INSIDE the transaction of
// both DeactivateResourceUseCase (UC-047) and CascadeStaffDeactivationUseCase (UC-048), after the
// resource is saved. It never opens a transaction of its own and never changes a booking: it only
// records one worklist entry per affected booking, with its advisory alternatives — and one
// ResourceDeactivationImpactRaised for the whole deactivation, which is what alerts the managers
// (the per-booking entries would send one email each, M23-S23).
@Injectable()
export class RaiseFutureCommitmentExceptionsForResourceService {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
  ) {}

  async raiseForResource(
    input: RaiseFutureCommitmentExceptionsForResourceInput,
  ): Promise<RaiseFutureCommitmentExceptionsForResourceResult> {
    const { tenantId, resourceId, correlationId } = input;

    // Narrows the window against a booking inserting occupancy on this resource concurrently (the
    // read below then sees it once it commits) — the resolver's own isActive read, taken before
    // this lock, is the documented residual gap.
    await this.tenantLock.lockResources(tenantId, [resourceId]);

    const impacts = await this.occupancyRepo.findFutureBookingImpactsByResource(
      tenantId,
      resourceId,
      new Date(),
    );
    if (impacts.length === 0) return { raisedCount: 0 };

    const bookings = await this.loadLiveBookings(impacts, tenantId);
    if (bookings.length === 0) return { raisedCount: 0 };

    const alternatives = await computeBookingAlternatives({
      tenantId,
      resourceId,
      bookings,
      impacts,
      serviceRepo: this.serviceRepo,
      resourceRepo: this.resourceRepo,
      occupancyRepo: this.occupancyRepo,
    });
    // One after another on the caller's single transaction connection.
    await mapSequentially(bookings, (booking) =>
      raiseFutureCommitmentException(this.exceptionRepo, {
        tenantId,
        sourceType: 'RESOURCE_DEACTIVATION',
        sourceId: resourceId,
        affectedType: 'BOOKING',
        affectedId: booking.id,
        alternatives: alternatives.get(booking.id) ?? [],
        correlationId,
      }),
    );
    await this.publishImpact(tenantId, resourceId, bookings.length, correlationId);
    return { raisedCount: bookings.length };
  }

  // Published through the outbox on the caller's transaction (no repository drains it: it is not an
  // aggregate event), so it commits or rolls back with the deactivation and the entries.
  private async publishImpact(
    tenantId: string,
    resourceId: string,
    affectedCount: number,
    correlationId: string,
  ): Promise<void> {
    const resource = await this.resourceRepo.findById(resourceId, tenantId);
    if (!resource) throw new ResourceNotFoundError(resourceId);
    await this.outboxPublisher.publish(
      new ResourceDeactivationImpactRaised(tenantId, correlationId, {
        resourceId,
        resourceName: resource.name,
        affectedCount,
      }),
    );
  }

  // Ordered by the booking's own start — the manager's deadline for each entry.
  private async loadLiveBookings(
    impacts: ResourceBookingImpact[],
    tenantId: string,
  ): Promise<Booking[]> {
    const bookingIds = [...new Set(impacts.map((i) => i.bookingId))];
    const bookings = await this.bookingRepo.findByIds(bookingIds, tenantId);
    return bookings
      .filter((b) => LIVE_BOOKING_STATUSES.has(b.status))
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }
}
