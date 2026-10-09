import type {
  BookingDeepLink,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { isCompositeService } from './availability-alert-link';
import {
  earliestBookableDate,
  lastBookableDate,
  resolveBasketBookingWindow,
} from './booking-window';
import { durationOptions, isCustomerSelectedDuration } from './duration-options';
import { toResourceSelectionItem } from './resource-picks';

// A link's pieces that survived validation against the page's own services and booking window.
export interface BookingDeepLinkSeed {
  readonly serviceId: string;
  readonly date: string | null;
  readonly durationMinutes: number | null;
  readonly resourceId: string | null;
}

export interface BookingDeepLinkContext {
  readonly maxBookingAdvanceDays: number;
  readonly timezone: string;
  readonly now: Date;
}

function seedDuration(service: HotsiteServiceResponse, minutes: number | null): number | null {
  if (minutes === null || !isCustomerSelectedDuration(service)) return null;
  return durationOptions(service).includes(minutes) ? minutes : null;
}

function seedDate(
  service: HotsiteServiceResponse,
  date: string | null,
  context: BookingDeepLinkContext,
): string | null {
  if (date === null) return null;
  const window = resolveBasketBookingWindow([service], context.maxBookingAdvanceDays);
  const { now, timezone } = context;
  const inWindow =
    date >= earliestBookableDate(now, window.minAdvanceHours, timezone) &&
    date <= lastBookableDate(now, window.maxAdvanceDays, timezone);
  return inWindow ? date : null;
}

// The pieces of the link this page can honour. A service the page does not offer (unknown,
// another tenant's, deactivated) drops the whole link. A customer-selected-duration service
// without a valid duration keeps no date: choosing the duration clears it anyway, and the duration
// step would open on its minimum.
export function resolveBookingDeepLinkSeed(
  params: BookingDeepLink | null,
  bookable: readonly HotsiteServiceResponse[],
  context: BookingDeepLinkContext,
): BookingDeepLinkSeed | null {
  const service = bookable.find((candidate) => candidate.id === params?.serviceId);
  if (!params || !service) return null;
  const durationMinutes = seedDuration(service, params.durationMinutes);
  const needsDuration = isCustomerSelectedDuration(service) && durationMinutes === null;
  return {
    serviceId: service.id,
    date: needsDuration ? null : seedDate(service, params.date, context),
    durationMinutes,
    resourceId: isCompositeService(service) ? null : params.resourceId,
  };
}

// The preferred resource as a pick, once the service's resource options are known: only when the
// service still offers it for its one flat requirement.
export function seededResourcePick(
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
  serviceId: string,
  resourceId: string,
): ResourceSelectionItem | null {
  const own = requirements.filter(
    (requirement) => requirement.serviceId === serviceId && (requirement.legIndex ?? null) === null,
  );
  if (own.length !== 1) return null;
  const [requirement] = own;
  return requirement.options.some((option) => option.resourceId === resourceId)
    ? toResourceSelectionItem(requirement, resourceId)
    : null;
}
