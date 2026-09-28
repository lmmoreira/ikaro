import type { StaffBookingListResponse } from '@ikaro/types';

type BookingCard = StaffBookingListResponse['items'][number];

// Circuit breaker against a runaway loop (a corrupted `total`, or a genuinely pathological range)
// — 50 pages at the 100-per-page limit this helper's callers all use is 5,000 bookings, well past
// what any real tenant's displayed range/window holds today. Hitting it throws rather than
// returning a truncated result: silently handing back fewer items than `total` claims is exactly
// the defect this helper exists to eliminate, so a page count this far outside normal bounds must
// surface as a visible failure, not a quietly incomplete "success".
const MAX_PAGES = 50;

// Sequential, not parallel: a range almost always needs one or two pages, so the extra code to
// fan out requests isn't worth it. De-dupes by bookingId (offset paging over a live table can
// repeat or skip a row if a booking is created between two requests) and stops on an empty page
// even if `total` still claims more remain, so a stale `total` can never loop forever.
export async function listAllPages(
  fetchPage: (page: number) => Promise<StaffBookingListResponse>,
): Promise<StaffBookingListResponse> {
  const first = await fetchPage(1);

  const merged = new Map<string, BookingCard>();
  for (const item of first.items) merged.set(item.bookingId, item);

  let page = first.page;
  let lastBatchSize = first.items.length;

  while (page * first.limit < first.total && lastBatchSize > 0) {
    if (page >= MAX_PAGES) {
      throw new Error(
        `listAllPages: exceeded ${MAX_PAGES} pages (total=${first.total}, limit=${first.limit}) — refusing to return a silently truncated result`,
      );
    }
    page += 1;
    const next = await fetchPage(page);
    lastBatchSize = next.items.length;
    for (const item of next.items) merged.set(item.bookingId, item);
  }

  return { items: [...merged.values()], total: first.total, page: first.page, limit: first.limit };
}
