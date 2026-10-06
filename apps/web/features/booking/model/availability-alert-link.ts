import type { HotsiteServiceResponse, ResourceSelectionItem } from '@ikaro/types';

interface AvailabilityAlertLinkInput {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly resourceSelections: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
}

// What the alert page reads back from the link. `serviceId` is the only required piece; a missing
// or malformed one is "no service" and the page shows the not-eligible state.
export interface AvailabilityAlertParams {
  readonly serviceId: string | null;
  readonly preferredResourceId: string | null;
  readonly durationMinutes: number | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// An alert holds exactly one preferred resource, so only a flat service with exactly one pick
// has one to carry. A legged or bundled service has one pick per leg/requirement — it passes none
// and the alert means "when the whole journey fits, with any resources" (docs/27 § Availability Alerts).
function singleResourcePick(
  service: HotsiteServiceResponse,
  resourceSelections: readonly ResourceSelectionItem[],
): string | null {
  if (service.legs !== null && service.legs.length > 0) return null;
  const own = resourceSelections.filter((pick) => pick.serviceId === service.id);
  return own.length === 1 ? own[0].resourceId : null;
}

// The alert page's path with its query string. The one place that knows the shape — the calendar
// step's button and the page's own login `returnTo` both go through it, so a guest comes back
// from login to exactly the URL the button opened. Every piece of criteria rides in the query, so
// a login round-trip only has to preserve this URL. No participant count: it is only collected
// at the intake step, after the calendar, and matching ignores it.
export function availabilityAlertPagePath(
  slug: string,
  params: {
    readonly serviceId: string;
    readonly preferredResourceId?: string | null;
    readonly durationMinutes?: number | null;
  },
): string {
  const query = new URLSearchParams({ serviceId: params.serviceId });
  if (params.preferredResourceId) query.set('preferredResourceId', params.preferredResourceId);
  if (params.durationMinutes) query.set('durationMinutes', String(params.durationMinutes));
  return `/${slug}/booking/availability-alert?${query.toString()}`;
}

// The "Avise-me quando abrir" link of the calendar step (M23-S31), or null when no alert can be
// offered. An alert is for exactly ONE service — matching evaluates one service's slots, so an
// alert on one line of a basket would fire on a slot that ignores the rest.
export function buildAvailabilityAlertLink(input: AvailabilityAlertLinkInput): string | null {
  if (input.services.length !== 1) return null;
  const [service] = input.services;
  if (!service.bookingPolicy.availabilityAlertEligible) return null;

  return availabilityAlertPagePath(input.slug, {
    serviceId: service.id,
    preferredResourceId: singleResourcePick(service, input.resourceSelections),
    durationMinutes: input.durationMinutes,
  });
}

function firstValue(value: string | readonly string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  return typeof single === 'string' && single.length > 0 ? single : null;
}

export function parseAvailabilityAlertParams(
  searchParams: Readonly<Record<string, string | readonly string[] | undefined>>,
): AvailabilityAlertParams {
  const serviceId = firstValue(searchParams.serviceId);
  const resourceId = firstValue(searchParams.preferredResourceId);
  const minutes = Number(firstValue(searchParams.durationMinutes));
  return {
    serviceId: serviceId !== null && UUID.test(serviceId) ? serviceId : null,
    preferredResourceId: resourceId !== null && UUID.test(resourceId) ? resourceId : null,
    durationMinutes: Number.isInteger(minutes) && minutes > 0 ? minutes : null,
  };
}
