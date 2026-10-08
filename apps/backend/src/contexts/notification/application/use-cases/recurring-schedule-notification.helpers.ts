import {
  addDaysUTC,
  utcDateToLocalDate,
  utcDateToLocalHHMM,
} from '../../../../shared/utils/calendar-date';
import { DEFAULT_LOCALE } from '../../domain/notification-locale.constants';
import { BaseNotificationDto } from '../dtos/base-notification.dto';
import { INotificationBookingPort } from '../ports/notification-booking.port';
import { INotificationCustomerPort } from '../ports/notification-customer.port';
import { INotificationPlatformPort } from '../ports/notification-platform.port';

// Shared by the four recurring-schedule email use cases (M23-S28): who the customer is, the
// service name and the tenant's locale are resolved the same way for all of them, and the
// weekday/date wording is the same in the customer and the manager email.

// The events carry only ids (docs/CODE_STANDARDS.md § Domain events) — names are resolved here.
export interface RecurringScheduleNotificationInput extends BaseNotificationDto {
  customerId: string;
  serviceId: string;
}

export interface RecurringScheduleSummaryInput {
  daysOfWeek: string[];
  // HH:mm, tenant-local already — no timezone conversion.
  startTime: string;
  // YYYY-MM-DD calendar dates.
  startsOn: string;
  endsOn: string;
}

export interface RecurringScheduleNotificationContext {
  locale: string;
  timezone: string;
  tenantName: string;
  serviceName: string;
  customerName: string;
  customerEmail: string;
}

export interface RecurringScheduleContextPorts {
  customerPort: INotificationCustomerPort;
  servicePort: INotificationBookingPort;
  tenantPort: INotificationPlatformPort;
}

// null when the customer or the service no longer exists in this tenant: the caller logs and
// acknowledges (no throw, no retry loop) — the same convention as the points notifications.
export async function resolveRecurringScheduleContext(
  ports: RecurringScheduleContextPorts,
  input: RecurringScheduleNotificationInput,
): Promise<RecurringScheduleNotificationContext | null> {
  const [customer, services, tenantInfo] = await Promise.all([
    ports.customerPort.getCustomerInfo(input.customerId, input.tenantId),
    ports.servicePort.findServicesByIds(input.tenantId, [input.serviceId]),
    ports.tenantPort.getTenantInfo(input.tenantId),
  ]);
  const service = services.find((s) => s.serviceId === input.serviceId);
  if (!customer || !service) return null;
  return {
    locale: tenantInfo?.locale ?? DEFAULT_LOCALE,
    timezone: tenantInfo?.timezone ?? 'UTC',
    tenantName: tenantInfo?.name ?? '',
    serviceName: service.serviceName,
    customerName: customer.name,
    customerEmail: customer.email,
  };
}

// A Monday: stepping from it with the shared addDaysUTC() gives a date for each weekday, which
// Intl then names in the tenant's locale.
const REFERENCE_MONDAY = '2024-01-01';
const WEEKDAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export function formatWeekdays(daysOfWeek: string[], locale: string): string {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' });
  const names = WEEKDAY_ORDER.filter((day) => daysOfWeek.includes(day)).map((day) =>
    weekday.format(utcDateOf(addDaysUTC(REFERENCE_MONDAY, WEEKDAY_ORDER.indexOf(day)))),
  );
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
}

// A calendar date has no timezone: anchor it at UTC midnight so Intl cannot shift the day.
function utcDateOf(date: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

// YYYY-MM-DD → the locale's numeric date.
export function formatCalendarDate(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcDateOf(date));
}

export function buildScheduleSummaryVariables(
  summary: RecurringScheduleSummaryInput,
  locale: string,
): Record<string, string> {
  return {
    weekdays: formatWeekdays(summary.daysOfWeek, locale),
    localTime: summary.startTime,
    startsOn: formatCalendarDate(summary.startsOn, locale),
    endsOn: formatCalendarDate(summary.endsOn, locale),
  };
}

// An instant (the approval hold deadline) → "dd/mm/yyyy HH:mm" in the tenant's timezone.
export function formatLocalDateTime(isoInstant: string, timezone: string, locale: string): string {
  const instant = new Date(isoInstant);
  return `${formatCalendarDate(utcDateToLocalDate(instant, timezone), locale)} ${utcDateToLocalHHMM(instant, timezone)}`;
}
