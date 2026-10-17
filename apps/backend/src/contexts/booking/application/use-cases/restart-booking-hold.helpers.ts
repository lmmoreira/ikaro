import { IResourceOccupancyRepository } from '../ports/resource-occupancy-repository.port';
import { IServiceRepository } from '../ports/service-repository.port';
import { Booking } from '../../domain/booking.aggregate';
import { resolveHoldExpiresAt } from './booking-request.helpers';

// TD51 — a customer's answer to a request for information puts the booking back in staff's queue,
// so the hold starts again for the same length a new request gets (the longest manualHoldMinutes
// among its services). Without it the original deadline, usually already past, would have the
// expiry job cancel the booking the moment the customer replied. Must run inside the caller's
// transaction, after the booking itself was saved.
export async function restartBookingHold(
  deps: { serviceRepo: IServiceRepository; occupancyRepo: IResourceOccupancyRepository },
  booking: Booking,
): Promise<void> {
  const serviceIds = [...new Set(booking.lines.map((line) => line.serviceId))];
  const services = await deps.serviceRepo.findByIds(serviceIds, booking.tenantId);
  await deps.occupancyRepo.restartHold(
    booking.tenantId,
    booking.lines.map((line) => line.lineId),
    resolveHoldExpiresAt(new Map(services.map((service) => [service.id, service]))),
  );
}
