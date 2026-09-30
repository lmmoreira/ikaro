import { Inject, Injectable } from '@nestjs/common';
import { Booking } from '../../domain/booking.aggregate';
import {
  FutureCommitmentAlternative,
  FutureCommitmentExceptionAffectedType,
  FutureCommitmentExceptionSourceType,
  FutureCommitmentExceptionStatus,
} from '../../domain/future-commitment-exception.types';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';

export interface ListFutureCommitmentExceptionsUseCaseInput {
  tenantId: string;
  status?: FutureCommitmentExceptionStatus;
}

// The Booking context's own summary of the affected booking — no Customer-context call. The
// resource name is the resource the entry is about (the deactivated one): the booking's own
// occupancy is still on it while the entry is OPEN.
export interface FutureCommitmentExceptionBookingSummary {
  contactName: string;
  scheduledAt: string;
  totalDurationMins: number;
  serviceNames: string[];
  status: string;
  resourceName: string | null;
}

export interface FutureCommitmentExceptionListItem {
  id: string;
  sourceType: FutureCommitmentExceptionSourceType;
  sourceId: string;
  affectedType: FutureCommitmentExceptionAffectedType;
  affectedId: string;
  status: FutureCommitmentExceptionStatus;
  alternatives: FutureCommitmentAlternative[];
  createdAt: string;
  booking: FutureCommitmentExceptionBookingSummary | null;
}

export interface ListFutureCommitmentExceptionsUseCaseResult {
  items: FutureCommitmentExceptionListItem[];
}

@Injectable()
export class ListFutureCommitmentExceptionsUseCase {
  constructor(
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
  ) {}

  async execute(
    input: ListFutureCommitmentExceptionsUseCaseInput,
  ): Promise<ListFutureCommitmentExceptionsUseCaseResult> {
    const { tenantId } = input;
    const exceptions = await this.exceptionRepo.findByTenant(tenantId, { status: input.status });

    const bookingIds = [
      ...new Set(exceptions.filter((e) => e.affectedType === 'BOOKING').map((e) => e.affectedId)),
    ];
    const bookings = new Map(
      (await this.bookingRepo.findByIds(bookingIds, tenantId)).map((b) => [b.id, b]),
    );
    // One read of the tenant's resources (deactivated ones included — they are the entries'
    // sources), not one per distinct source: a tenant has tens of resources, not thousands.
    const resourceNames = new Map(
      (await this.resourceRepo.findByTenant(tenantId, {})).map((r) => [r.id, r.name]),
    );

    const items = exceptions.map((e) => ({
      id: e.id,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      affectedType: e.affectedType,
      affectedId: e.affectedId,
      status: e.status,
      alternatives: e.alternatives,
      createdAt: e.createdAt.toISOString(),
      booking: toBookingSummary(bookings.get(e.affectedId), resourceNames.get(e.sourceId) ?? null),
    }));
    // The manager's deadline for an entry is the booking's own start, so earliest first; an entry
    // whose booking cannot be read sorts last.
    items.sort(compareByBookingStart);
    return { items };
  }
}

function toBookingSummary(
  booking: Booking | undefined,
  resourceName: string | null,
): FutureCommitmentExceptionBookingSummary | null {
  if (!booking) return null;
  return {
    contactName: booking.contactName,
    scheduledAt: booking.scheduledAt.toISOString(),
    totalDurationMins: booking.totalDurationMins,
    serviceNames: booking.lines.map((l) => l.serviceNameAtBooking),
    status: booking.status,
    resourceName,
  };
}

function compareByBookingStart(
  a: FutureCommitmentExceptionListItem,
  b: FutureCommitmentExceptionListItem,
): number {
  if (!a.booking) return b.booking ? 1 : 0;
  if (!b.booking) return -1;
  return a.booking.scheduledAt.localeCompare(b.booking.scheduledAt);
}
