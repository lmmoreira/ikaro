import { Inject, Injectable } from '@nestjs/common';
import { Booking, BookingStatus } from '../../domain/booking.aggregate';
import { FutureCommitmentAlternative } from '../../domain/future-commitment-exception.types';
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
import {
  AlternativesRequest,
  computeAlternatives,
  findRequirementForAssignment,
} from './future-commitment-alternatives.helpers';
import { raiseFutureCommitmentException } from './future-commitment-exception-raise.helpers';
import { mapSequentially } from '../../../../shared/utils/sequential';

export interface RaiseFutureCommitmentExceptionsForResourceUseCaseInput {
  tenantId: string;
  resourceId: string;
  correlationId: string;
}

export interface RaiseFutureCommitmentExceptionsForResourceUseCaseResult {
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
// records one worklist entry per affected booking, with its advisory alternatives.
@Injectable()
export class RaiseFutureCommitmentExceptionsForResourceUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
  ) {}

  async execute(
    input: RaiseFutureCommitmentExceptionsForResourceUseCaseInput,
  ): Promise<RaiseFutureCommitmentExceptionsForResourceUseCaseResult> {
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

    const alternatives = await this.computeAlternativesByBooking(
      tenantId,
      resourceId,
      bookings,
      impacts,
    );
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
    return { raisedCount: bookings.length };
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

  private async computeAlternativesByBooking(
    tenantId: string,
    resourceId: string,
    bookings: Booking[],
    impacts: ResourceBookingImpact[],
  ): Promise<Map<string, FutureCommitmentAlternative[]>> {
    const type = impacts[0].resourceType;
    const serviceIds = [...new Set(bookings.flatMap((b) => b.lines.map((l) => l.serviceId)))];
    const services = new Map(
      (await this.serviceRepo.findByIds(serviceIds, tenantId)).map((s) => [s.id, s]),
    );
    const activeCandidates = (
      await this.resourceRepo.findByTenant(tenantId, { type, isActive: true })
    ).filter((r) => r.id !== resourceId);

    const requests: AlternativesRequest[] = bookings.map((booking) => {
      const rows = impacts.filter((i) => i.bookingId === booking.id);
      const serviceByLine = new Map(booking.lines.map((l) => [l.lineId, l.serviceId]));
      return {
        key: booking.id,
        windows: rows.map((r) => ({ startsAt: r.startsAt, endsAt: r.endsAt })),
        pools: rows.map(
          (r) =>
            findRequirementForAssignment(
              services.get(serviceByLine.get(r.bookingLineId) ?? ''),
              r.legIndex,
              type,
            )?.resourcePoolIds ?? null,
        ),
      };
    });
    return computeAlternatives({
      occupancyRepo: this.occupancyRepo,
      activeCandidates,
      tenantId,
      requests,
    });
  }
}
