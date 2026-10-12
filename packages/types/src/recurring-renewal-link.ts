// The link the recurring-schedule renewal email opens: the customer's "new recurring reservation"
// page pre-filled from the schedule being renewed (docs/27 § Renewal window and reminder). The
// backend builds it and the web page parses it, so the path and the parameter name live here once.

interface QueryReader {
  get(name: string): string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const RECURRING_RENEWAL_PATH = '/my-account/recurring-schedules/new';
export const RECURRING_RENEWAL_PARAM = 'renewFrom';

/** `{hotsiteUrl}/my-account/recurring-schedules/new?renewFrom=…`; an empty hotsite URL stays empty (never a relative link). */
export function buildRecurringRenewalUrl(hotsiteUrl: string, scheduleId: string): string {
  if (!hotsiteUrl) return hotsiteUrl;
  const query = new URLSearchParams({ [RECURRING_RENEWAL_PARAM]: scheduleId });
  return `${hotsiteUrl}${RECURRING_RENEWAL_PATH}?${query.toString()}`;
}

/** The schedule id a link asks to renew, or null when the parameter is absent or not an id. */
export function parseRecurringRenewalLink(query: QueryReader): string | null {
  const scheduleId = query.get(RECURRING_RENEWAL_PARAM);
  return scheduleId !== null && UUID.test(scheduleId) ? scheduleId : null;
}
