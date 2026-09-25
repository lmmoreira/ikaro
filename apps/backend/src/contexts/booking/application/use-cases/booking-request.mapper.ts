import { Booking } from '../../domain/booking.aggregate';
import { BookingLineInput } from '../../domain/booking-line.entity';
import { BookingServiceNotInTenantError } from '../../domain/errors/booking-domain.error';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { BookingRequestResult } from './booking-request.types';
import { ResolvedLineCandidates, ResourceSelectionInput } from './resource-occupancy.helpers';

// Pure DTO/domain shape translation shared by RequestBookingUseCase and
// RequestAuthenticatedBookingUseCase — no I/O, no transaction, no business-rule enforcement. See
// booking-request.helpers.ts for this booking-request flow's transactional orchestration logic.

export function buildLineInputs(
  serviceIds: string[],
  serviceMap: Map<string, Service>,
): BookingLineInput[] {
  return serviceIds.map((serviceId) => {
    const service = serviceMap.get(serviceId);
    if (!service) throw new BookingServiceNotInTenantError(serviceId);
    return {
      serviceId: service.id,
      serviceNameAtBooking: service.name,
      priceAtBooking: service.price,
      durationMinsAtBooking: service.durationMinutes,
      pointsValueAtBooking: service.loyaltyPointsValue,
      requiresPickupAddressAtBooking: service.requiresPickupAddress,
    };
  });
}

// Set only when this line resolved a legged service — mutually exclusive with an AUTO_ANY name
// reveal below (UC-065's itinerary always wins when both would otherwise apply, since a legged
// requirement's own selectionMode already feeds into the itinerary entries themselves).
function toLineIdentityFields(
  resolved: ResolvedLineCandidates | undefined,
): Pick<BookingRequestResult['lines'][number], 'assignedResourceName' | 'itinerary'> {
  if (!resolved) return {};
  const legCandidates = resolved.candidates
    .filter((c) => c.legIndex !== null)
    .sort((a, b) => a.legIndex! - b.legIndex!);
  if (legCandidates.length > 0) {
    return {
      itinerary: legCandidates.map((c) => ({
        legIndex: c.legIndex!,
        resourceName: c.resourceName,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
      })),
    };
  }
  const revealedNames = resolved.candidates
    .filter((c) => c.legIndex === null && c.selectionMode === 'AUTO_ANY')
    .map((c) => c.resourceName);
  return revealedNames.length > 0 ? { assignedResourceName: revealedNames.join(', ') } : {};
}

// dto.resourceType is the Zod schema's plain string-literal union — same bridge-to-domain-enum
// pattern as resource-requirement.dto.ts's toResourceRequirement(). legIndex defaults to null
// (a flat, non-legged choice) when the client omits it, matching ResourceOccupancyCandidate's own
// null-for-flat shape.
export function toResourceSelections(
  dtoSelections:
    | { serviceId: string; legIndex?: number | null; resourceType: string; resourceId: string }[]
    | undefined,
): ResourceSelectionInput[] {
  return (dtoSelections ?? []).map((selection) => ({
    serviceId: selection.serviceId,
    legIndex: selection.legIndex ?? null,
    resourceType: selection.resourceType as ResourceType,
    resourceId: selection.resourceId,
  }));
}

export function toBookingResult(
  booking: Booking,
  candidatesByLine: Map<string, ResolvedLineCandidates>,
): BookingRequestResult {
  const pickup = booking.pickupAddress;
  return {
    bookingId: booking.id,
    status: booking.status,
    scheduledAt: booking.scheduledAt.toISOString(),
    totalPrice: {
      amount: booking.totalPrice.amount.toNumber(),
      currency: booking.totalPrice.currency,
    },
    totalDurationMins: booking.totalDurationMins,
    pickupAddress: pickup
      ? {
          street: pickup.street,
          number: pickup.number,
          complement: pickup.complement ?? null,
          neighborhood: pickup.neighborhood ?? null,
          city: pickup.city,
          state: pickup.state,
          zipCode: pickup.zipCode,
        }
      : null,
    beforeServicePhotoUrls: booking.beforeServicePhotoUrls ?? [],
    lines: booking.lines.map((l) => ({
      lineId: l.lineId,
      serviceId: l.serviceId,
      priceAtBooking: {
        amount: l.priceAtBooking.amount.toNumber(),
        currency: l.priceAtBooking.currency,
      },
      durationMinsAtBooking: l.durationMinsAtBooking,
      pointsValueAtBooking: l.pointsValueAtBooking,
      requiresPickupAddressAtBooking: l.requiresPickupAddressAtBooking,
      ...toLineIdentityFields(candidatesByLine.get(l.lineId)),
    })),
  };
}
