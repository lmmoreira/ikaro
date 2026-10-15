import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { Booking } from '../../domain/booking.aggregate';
import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
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
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { computeBookingAlternatives } from './future-commitment-alternatives.helpers';

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
  // true = a registered customer's booking; false = a guest (the queue card's Cliente/Visitante pill).
  isCustomer: boolean;
  totalPrice: { amount: number; currency: string };
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
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
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
    const currentAlternatives = await this.currentAlternatives(tenantId, exceptions, bookings);

    const items = exceptions.map((e) => ({
      id: e.id,
      sourceType: e.sourceType,
      sourceId: e.sourceId,
      affectedType: e.affectedType,
      affectedId: e.affectedId,
      status: e.status,
      // An OPEN entry shows what is compatible and free NOW; a closed one keeps what was stored.
      alternatives: currentAlternatives.get(e.id) ?? e.alternatives,
      createdAt: e.createdAt.toISOString(),
      booking: toBookingSummary(bookings.get(e.affectedId), resourceNames.get(e.sourceId) ?? null),
    }));
    // The manager's deadline for an entry is the booking's own start, so earliest first; an entry
    // whose booking cannot be read sorts last.
    items.sort(compareByBookingStart);
    return { items };
  }

  // The stored alternatives are a snapshot from when the entry was raised: a resource reactivated,
  // or a slot freed by a cancellation, since then would never show. So an OPEN entry's alternatives
  // are recomputed on every read — one batched conflict query per deactivated resource, not one per
  // booking. The occupancy port needs a transaction, so the reads share one read-only run.
  private async currentAlternatives(
    tenantId: string,
    exceptions: readonly FutureCommitmentException[],
    bookings: ReadonlyMap<string, Booking>,
  ): Promise<Map<string, FutureCommitmentAlternative[]>> {
    const bySource = new Map<string, FutureCommitmentException[]>();
    for (const e of exceptions) {
      if (e.status !== 'OPEN' || e.affectedType !== 'BOOKING' || !bookings.has(e.affectedId)) {
        continue;
      }
      bySource.set(e.sourceId, [...(bySource.get(e.sourceId) ?? []), e]);
    }
    if (bySource.size === 0) return new Map();

    const result = new Map<string, FutureCommitmentAlternative[]>();
    await this.txManager.run(async () => {
      await mapSequentially([...bySource], async ([sourceId, entries]) => {
        const wanted = new Set(entries.map((e) => e.affectedId));
        const impacts = (
          await this.occupancyRepo.findFutureBookingImpactsByResource(
            tenantId,
            sourceId,
            new Date(),
          )
        ).filter((i) => wanted.has(i.bookingId));
        const withImpacts = new Set(impacts.map((i) => i.bookingId));
        const alternatives =
          impacts.length === 0
            ? new Map<string, FutureCommitmentAlternative[]>()
            : await computeBookingAlternatives({
                tenantId,
                resourceId: sourceId,
                bookings: [...withImpacts].flatMap((id) => bookings.get(id) ?? []),
                impacts,
                serviceRepo: this.serviceRepo,
                resourceRepo: this.resourceRepo,
                occupancyRepo: this.occupancyRepo,
              });
        // A booking with no live occupancy left on the source has nothing to move: no alternatives.
        for (const e of entries) result.set(e.id, alternatives.get(e.affectedId) ?? []);
      });
    });
    return result;
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
    isCustomer: booking.customerId !== null,
    totalPrice: {
      amount: booking.totalPrice.amount.toNumber(),
      currency: booking.totalPrice.currency,
    },
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
