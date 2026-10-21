import { Booking } from '../../domain/booking.aggregate';
import {
  BookingScheduledAtInvalidError,
  BookingScheduledInPastError,
} from '../../domain/errors/booking-domain.error';
import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
import { Service } from '../../domain/service.aggregate';
import { IServiceRepository } from '../ports/service-repository.port';
import { ITenantLockPort } from '../ports/tenant-lock.port';
import { occupiedResourceIds } from '../helpers/booking-exception-closing.helpers';
import {
  rescheduleBookingInTransaction,
  RescheduleBookingInTransactionDeps,
} from './reschedule-booking-in-transaction.helpers';
import { lockRescheduleCandidateResources } from './reschedule-quote.helpers';
import { ResolutionSnapshot } from './resource-resolution-context.helpers';

export interface WorklistRescheduleDeps extends RescheduleBookingInTransactionDeps {
  serviceRepo: IServiceRepository;
  tenantLock: ITenantLockPort;
}

export interface WorklistRescheduleParams {
  tenantId: string;
  staffId: string;
  correlationId: string;
  timezone: string;
  scheduledAt: string;
  exception: FutureCommitmentException;
  booking: Booking;
  // What the pre-lock read; the reschedule resolves from it so it never locks beyond the held set.
  resolutionSnapshot?: ResolutionSnapshot;
}

export async function loadServiceMap(
  deps: WorklistRescheduleDeps,
  booking: Booking,
  tenantId: string,
): Promise<Map<string, Service>> {
  const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
  const services = await deps.serviceRepo.findByIds(serviceIds, tenantId);
  return new Map(services.map((service) => [service.id, service]));
}

// The worklist's RESCHEDULE takes every resource lock it will need in one call BEFORE the entry
// row lock: the booking's current resources, the entry's source resource and the candidates for
// the new window. Reactivating the source resource takes the resource lock first and the entry
// rows after, so the two meet in the same order (docs/LOCK_CATALOG.md § 2, hazard H2). The
// entry and the booking are read unlocked only to know which resources to lock; the locks that
// follow re-read them. The reschedule below asks for the same ids again, which it already holds.
export async function lockRescheduleResourcesBeforeEntry(
  deps: WorklistRescheduleDeps,
  params: { tenantId: string; exceptionId: string; scheduledAt: string; timezone: string },
): Promise<ResolutionSnapshot | undefined> {
  const { tenantId, exceptionId, scheduledAt, timezone } = params;
  const entry = await deps.exceptionRepo.findById(exceptionId, tenantId);
  if (!entry) return undefined;
  const booking = await deps.bookingRepo.findById(entry.affectedId, tenantId);
  if (!booking) return undefined;
  const newScheduledAt = new Date(scheduledAt);
  if (Number.isNaN(newScheduledAt.getTime()) || newScheduledAt <= new Date()) return undefined;
  const occupied = await occupiedResourceIds(deps.occupancyRepo, tenantId, [booking]);
  return lockRescheduleCandidateResources({
    resourceRepo: deps.resourceRepo,
    availabilityService: deps.availabilityService,
    occupancyRepo: deps.occupancyRepo,
    slotConflictService: deps.slotConflictService,
    booking,
    serviceMap: await loadServiceMap(deps, booking, tenantId),
    tenantId,
    newScheduledAt,
    timezone,
    overrideSelections: [],
    durationChange: undefined,
    alsoLockResourceIds: [...occupied, entry.sourceId],
  });
}

// The worklist's RESCHEDULE (UC-077). Booking.reschedule() refuses anything but an APPROVED
// booking (InvalidBookingTransition), which surfaces as a per-entry STILL_OPEN with its own error
// code. The selected entry is resolved by the manager afterwards, so the reschedule leaves it
// alone and only closes the booking's other entries that became obsolete.
export async function rescheduleThroughWorklist(
  deps: WorklistRescheduleDeps,
  params: WorklistRescheduleParams,
): Promise<void> {
  const { tenantId, booking } = params;
  const newScheduledAt = new Date(params.scheduledAt);
  if (Number.isNaN(newScheduledAt.getTime())) throw new BookingScheduledAtInvalidError();
  if (newScheduledAt <= new Date()) throw new BookingScheduledInPastError();

  await rescheduleBookingInTransaction(deps, {
    booking,
    serviceMap: await loadServiceMap(deps, booking, tenantId),
    newScheduledAt,
    durationChange: undefined,
    overrideSelections: [],
    tenantId,
    staffId: params.staffId,
    correlationId: params.correlationId,
    timezone: params.timezone,
    excludeExceptionIds: [params.exception.id],
    resolutionSnapshot: params.resolutionSnapshot,
  });
}
