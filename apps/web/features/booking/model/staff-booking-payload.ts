import type { CreateBookingByStaffRequest, StaffBookingBaseRequest } from '@ikaro/types';
import { buildFlowFields, type BookingPayloadSelections } from './booking-payload';
import { sanitizeAddress } from './personal-info';

/** Who the booking is for: exactly one of a tenant customer or the contact of a new person. */
export type StaffBookingRecipient =
  | { readonly kind: 'customer'; readonly customerId: string }
  | {
      readonly kind: 'guest';
      readonly contactName: string;
      readonly contactPhone: string;
      readonly contactEmail: string;
    };

function baseRequest(selections: BookingPayloadSelections): StaffBookingBaseRequest {
  return {
    scheduledAt: selections.slot.startsAt,
    serviceIds: [...selections.serviceIds],
    ...(selections.requiresPickupAddress
      ? { pickupAddress: sanitizeAddress(selections.pickupAddress) }
      : {}),
    ...buildFlowFields(selections),
  };
}

// `POST /bookings/staff` is a strict body: a customer booking carries `customerId` and no contact
// field, a guest booking carries the contact trio and no `customerId` — never both, and no photos.
export function buildStaffBookingPayload(
  recipient: StaffBookingRecipient,
  selections: BookingPayloadSelections,
): CreateBookingByStaffRequest {
  const base = baseRequest(selections);
  if (recipient.kind === 'customer') return { ...base, customerId: recipient.customerId };
  return {
    ...base,
    contactName: recipient.contactName,
    contactPhone: recipient.contactPhone,
    contactEmail: recipient.contactEmail,
  };
}
