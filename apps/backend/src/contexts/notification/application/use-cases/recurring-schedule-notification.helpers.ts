import { escapeHtml } from '../../../../shared/utils/escape-html';
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_LOCALE,
  DEFAULT_TIME_FORMAT,
} from '../../domain/notification-locale.constants';
import { BaseNotificationDto } from '../dtos/base-notification.dto';
import { INotificationBookingPort } from '../ports/notification-booking.port';
import { INotificationCustomerPort } from '../ports/notification-customer.port';
import { INotificationPlatformPort } from '../ports/notification-platform.port';
import {
  formatEmailDate,
  formatEmailTime,
  formatWeekdays,
  TenantEmailFormats,
} from './notification-email-format.helpers';

// Shared by the four recurring-schedule email use cases (M23-S28): who the customer is, the
// service name and the tenant's locale and formats are resolved the same way for all of them, and
// the weekday/date wording is the same in the customer and the manager email.

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

export interface RecurringScheduleNotificationContext extends TenantEmailFormats {
  locale: string;
  timezone: string;
  tenantName: string;
  tenantSlug: string;
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
    dateFormat: tenantInfo?.dateFormat ?? DEFAULT_DATE_FORMAT,
    timeFormat: tenantInfo?.timeFormat ?? DEFAULT_TIME_FORMAT,
    timezone: tenantInfo?.timezone ?? 'UTC',
    tenantName: tenantInfo?.name ?? '',
    tenantSlug: tenantInfo?.slug ?? '',
    serviceName: service.serviceName,
    customerName: customer.name,
    customerEmail: customer.email,
  };
}

// The customer's and the service's names are typed by people (a guest, a manager), so they are
// escaped before they go into an HTML body. The tenant name is not: it also appears in a subject,
// which is plain text, and the business sets it itself.
export function customerVariables(context: RecurringScheduleNotificationContext): {
  contactName: string;
  serviceName: string;
} {
  return {
    contactName: escapeHtml(context.customerName),
    serviceName: escapeHtml(context.serviceName),
  };
}

export function buildScheduleSummaryVariables(
  summary: RecurringScheduleSummaryInput,
  context: Pick<RecurringScheduleNotificationContext, 'locale' | 'dateFormat' | 'timeFormat'>,
): { weekdays: string; localTime: string; startsOn: string; endsOn: string } {
  return {
    weekdays: formatWeekdays(summary.daysOfWeek, context.locale),
    localTime: formatEmailTime(summary.startTime, context.timeFormat),
    startsOn: formatEmailDate(summary.startsOn, context.dateFormat),
    endsOn: formatEmailDate(summary.endsOn, context.dateFormat),
  };
}
