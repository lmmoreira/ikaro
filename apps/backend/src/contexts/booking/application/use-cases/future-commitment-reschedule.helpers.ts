import { Booking } from '../../domain/booking.aggregate';
import { BookingScheduledInPastError } from '../../domain/errors/booking-domain.error';
import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
import { IServiceRepository } from '../ports/service-repository.port';
import {
  rescheduleBookingInTransaction,
  RescheduleBookingInTransactionDeps,
} from './reschedule-booking-in-transaction.helpers';

export interface WorklistRescheduleDeps extends RescheduleBookingInTransactionDeps {
  serviceRepo: IServiceRepository;
}

export interface WorklistRescheduleParams {
  tenantId: string;
  staffId: string;
  correlationId: string;
  timezone: string;
  scheduledAt: string;
  exception: FutureCommitmentException;
  booking: Booking;
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
  if (newScheduledAt <= new Date()) throw new BookingScheduledInPastError();

  const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
  const services = await deps.serviceRepo.findByIds(serviceIds, tenantId);
  await rescheduleBookingInTransaction(deps, {
    booking,
    serviceMap: new Map(services.map((service) => [service.id, service])),
    newScheduledAt,
    durationChange: undefined,
    overrideSelections: [],
    tenantId,
    staffId: params.staffId,
    correlationId: params.correlationId,
    timezone: params.timezone,
    excludeExceptionIds: [params.exception.id],
  });
}
