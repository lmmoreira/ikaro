import type {
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { isCompositeService, isUuid } from './availability-alert-link';
import {
  earliestBookableDate,
  lastBookableDate,
  resolveBasketBookingWindow,
} from './booking-window';
import { durationOptions, isCustomerSelectedDuration } from './duration-options';
import { toResourceSelectionItem } from './resource-picks';

// What the availability-alert email's link carries (docs/27 § Availability Alerts). Every piece is
// untrusted input from a URL: a piece that does not parse is simply absent.
export interface BookingDeepLinkParams {
  readonly serviceId: string;
  readonly date: string | null;
  readonly durationMinutes: number | null;
  readonly resourceId: string | null;
}

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

interface QueryReader {
  get(name: string): string | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function uuidOrNull(value: string | null): string | null {
  return value !== null && isUuid(value) ? value : null;
}

function positiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const minutes = Number(value);
  return Number.isSafeInteger(minutes) && minutes > 0 ? minutes : null;
}

// A link without a usable service is not a deep link at all: there is nothing to pre-select.
export function parseBookingDeepLink(query: QueryReader): BookingDeepLinkParams | null {
  const serviceId = uuidOrNull(query.get('serviceId'));
  if (serviceId === null) return null;
  const date = query.get('date');
  return {
    serviceId,
    date: date !== null && isCalendarDate(date) ? date : null,
    durationMinutes: positiveInteger(query.get('durationMinutes')),
    resourceId: uuidOrNull(query.get('resourceId')),
  };
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
  params: BookingDeepLinkParams | null,
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
