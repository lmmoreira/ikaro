import { addDaysUTC, utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import {
  BookingScheduledInPastError,
  BookingTooFarAheadError,
  BookingTooSoonError,
  ServiceBookingPolicyInvalidError,
} from '../../domain/errors/booking-domain.error';
import { Service } from '../../domain/service.aggregate';
import type { ServiceBookingPolicyProps } from '../../domain/service.types';
import type { TenantBookingWindow } from '../ports/booking-platform.port';

export type { TenantBookingWindow };

const MS_PER_HOUR = 3_600_000;
const HOURS_PER_DAY = 24;

export interface BookingWindow {
  minAdvanceHours: number;
  maxAdvanceDays: number;
}

// The tenant window is the ceiling: a service override can only tighten it, never loosen it, and a
// tenant that shrinks its window later wins over a stale looser override. A basket takes the
// strictest value per field across its lines.
export function resolveEffectiveBookingWindow(
  tenant: TenantBookingWindow,
  services: Iterable<Service>,
): BookingWindow {
  let minAdvanceHours = tenant.minBookingAdvanceHours;
  let maxAdvanceDays = tenant.maxBookingAdvanceDays;
  for (const { bookingPolicy } of services) {
    minAdvanceHours = Math.max(minAdvanceHours, bookingPolicy.minBookingAdvanceHoursOverride ?? 0);
    maxAdvanceDays = Math.min(
      maxAdvanceDays,
      bookingPolicy.maxBookingAdvanceDaysOverride ?? tenant.maxBookingAdvanceDays,
    );
  }
  return { minAdvanceHours, maxAdvanceDays };
}

export interface AssertWithinBookingWindowParams {
  startsAt: Date;
  now: Date;
  timezone: string;
  window: BookingWindow;
}

// The last bookable day is `today + maxAdvanceDays - 1`, both in the tenant timezone — the day
// boundary a customer sees. The minimum notice is an instant comparison, so it needs no timezone.
export function assertWithinBookingWindow(params: AssertWithinBookingWindowParams): void {
  const { startsAt, now, timezone, window } = params;
  if (startsAt <= now) throw new BookingScheduledInPastError();
  if (startsAt.getTime() < now.getTime() + window.minAdvanceHours * MS_PER_HOUR) {
    throw new BookingTooSoonError(window.minAdvanceHours);
  }
  const lastBookableDate = addDaysUTC(utcDateToLocalDate(now, timezone), window.maxAdvanceDays - 1);
  if (utcDateToLocalDate(startsAt, timezone) > lastBookableDate) {
    throw new BookingTooFarAheadError(window.maxAdvanceDays);
  }
}

export interface BookingWindowRequest {
  scheduledAt: string;
  timezone: string;
  tenantBookingWindow: TenantBookingWindow;
}

// The one call every customer-facing entry point makes: resolve the window the chosen services
// allow, then check the requested start against it.
export function assertWithinEffectiveBookingWindow(
  request: BookingWindowRequest,
  services: Iterable<Service>,
): void {
  assertWithinBookingWindow({
    startsAt: new Date(request.scheduledAt),
    now: new Date(),
    timezone: request.timezone,
    window: resolveEffectiveBookingWindow(request.tenantBookingWindow, services),
  });
}

// A service can only tighten the tenant window, and the window it ends up with must leave at least
// one bookable day. Validated against the *resolved* policy (the PATCH merged with the saved one),
// so a request that sets only one of the two overrides is still checked against the other side.
export function assertBookingWindowOverridesValid(
  policy: Pick<
    ServiceBookingPolicyProps,
    'minBookingAdvanceHoursOverride' | 'maxBookingAdvanceDaysOverride'
  >,
  tenant: TenantBookingWindow,
): void {
  const { minBookingAdvanceHoursOverride: minHours, maxBookingAdvanceDaysOverride: maxDays } =
    policy;
  if (maxDays != null && maxDays > tenant.maxBookingAdvanceDays) {
    throw new ServiceBookingPolicyInvalidError('max-advance-exceeds-tenant');
  }
  if (minHours != null && minHours < tenant.minBookingAdvanceHours) {
    throw new ServiceBookingPolicyInvalidError('min-advance-below-tenant');
  }
  const effectiveMinHours = Math.max(minHours ?? 0, tenant.minBookingAdvanceHours);
  const effectiveMaxDays = Math.min(
    maxDays ?? tenant.maxBookingAdvanceDays,
    tenant.maxBookingAdvanceDays,
  );
  if (effectiveMinHours / HOURS_PER_DAY >= effectiveMaxDays) {
    throw new ServiceBookingPolicyInvalidError('booking-window-empty');
  }
}
