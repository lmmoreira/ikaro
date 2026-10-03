import type {
  Address,
  AuthenticatedBookingRequest,
  AvailableSlot,
  BookingFlowRequestFields,
  CreateBookingRequest,
  ResourceSelectionItem,
} from '@ikaro/types';
import { isAddressFilled, sanitizeAddress, type PersonalInfoValue } from './personal-info';
import { orderPicks } from './resource-picks';

export interface BookingPayloadSelections {
  readonly serviceIds: readonly string[];
  readonly slot: AvailableSlot;
  readonly pickupAddress: Address;
  readonly requiresPickupAddress: boolean;
  readonly resourcePicks: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
  readonly intakeFields: BookingFlowRequestFields | null;
}

function buildFlowFields(selections: BookingPayloadSelections): BookingFlowRequestFields {
  const resourceSelections = orderPicks(selections.resourcePicks, selections.serviceIds);
  return {
    ...(resourceSelections.length > 0 ? { resourceSelections } : {}),
    ...(selections.durationMinutes === undefined
      ? {}
      : { durationMinutes: selections.durationMinutes }),
    ...selections.intakeFields,
  };
}

export function buildGuestBookingPayload(
  personalInfo: PersonalInfoValue,
  selections: BookingPayloadSelections,
  requireNeighborhood: boolean,
): CreateBookingRequest {
  return {
    contactName: personalInfo.contactName,
    contactEmail: personalInfo.contactEmail,
    contactPhone: personalInfo.contactPhone,
    scheduledAt: selections.slot.startsAt,
    serviceIds: [...selections.serviceIds],
    ...(isAddressFilled(personalInfo.contactAddress, requireNeighborhood)
      ? { contactAddress: sanitizeAddress(personalInfo.contactAddress) }
      : {}),
    ...(selections.requiresPickupAddress
      ? { pickupAddress: sanitizeAddress(selections.pickupAddress) }
      : {}),
    ...(personalInfo.photoFilePaths.length > 0
      ? { beforeServicePhotoUrls: [...personalInfo.photoFilePaths] }
      : {}),
    ...buildFlowFields(selections),
  };
}

export function buildAuthenticatedBookingPayload(
  photoFilePaths: readonly string[],
  selections: BookingPayloadSelections,
): AuthenticatedBookingRequest {
  return {
    scheduledAt: selections.slot.startsAt,
    serviceIds: [...selections.serviceIds],
    ...(selections.requiresPickupAddress
      ? { pickupAddress: sanitizeAddress(selections.pickupAddress) }
      : {}),
    ...(photoFilePaths.length > 0 ? { beforeServicePhotoUrls: [...photoFilePaths] } : {}),
    ...buildFlowFields(selections),
  };
}
