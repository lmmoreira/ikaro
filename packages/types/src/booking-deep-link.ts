// The link the availability-alert email opens: the booking page on the alert's service, the day the
// slot opened and, when the alert has them, its duration and preferred resource
// (docs/27 § Availability Alerts). The backend builds it and the web booking page parses it, so
// the parameter names and their shape live here once.

export interface BookingDeepLinkInput {
  readonly serviceId: string;
  /** YYYY-MM-DD, the tenant-local day of the matched slot. */
  readonly date: string;
  readonly durationMinutes?: number | null;
  readonly resourceId?: string | null;
}

// Every piece of a parsed link except the service is optional: a piece that does not parse is
// simply absent.
export interface BookingDeepLink {
  readonly serviceId: string;
  readonly date: string | null;
  readonly durationMinutes: number | null;
  readonly resourceId: string | null;
}

interface QueryReader {
  get(name: string): string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BOOKING_PATH = '/booking';

/** `{hotsiteUrl}/booking?serviceId=…&date=…`; an empty hotsite URL stays empty (never a relative link). */
export function buildBookingDeepLinkUrl(hotsiteUrl: string, link: BookingDeepLinkInput): string {
  if (!hotsiteUrl) return hotsiteUrl;
  const query = new URLSearchParams({ serviceId: link.serviceId, date: link.date });
  if (link.durationMinutes) query.set('durationMinutes', String(link.durationMinutes));
  if (link.resourceId) query.set('resourceId', link.resourceId);
  return `${hotsiteUrl}${BOOKING_PATH}?${query.toString()}`;
}

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function uuidOrNull(value: string | null): string | null {
  return value !== null && UUID.test(value) ? value : null;
}

function positiveIntegerOrNull(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** A link without a usable service is not a deep link at all: there is nothing to pre-select. */
export function parseBookingDeepLink(query: QueryReader): BookingDeepLink | null {
  const serviceId = uuidOrNull(query.get('serviceId'));
  if (serviceId === null) return null;
  const date = query.get('date');
  return {
    serviceId,
    date: date !== null && isCalendarDate(date) ? date : null,
    durationMinutes: positiveIntegerOrNull(query.get('durationMinutes')),
    resourceId: uuidOrNull(query.get('resourceId')),
  };
}
