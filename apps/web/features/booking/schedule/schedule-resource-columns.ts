import type {
  BookingStatus,
  DayGridColumn,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import {
  buildTimelineDayData,
  getBookingDateKey,
  type BufferTail,
  type TimelineDayData,
} from '@/features/booking/schedule/schedule-timeline';
import {
  keepLongestTail,
  resolveBufferTail,
} from '@/features/booking/schedule/schedule-held-tails';
import { getLocalTimeKey } from '@/features/booking/schedule/date-utils';
import {
  applySharedTimelineWindow,
  rendersOwnLabelColumn,
  resolveSharedTimelineWindow,
} from '@/features/booking/schedule/schedule-shared-timeline-window';

// TD43 — a day-grid BOOKING block whose own interval (startsAt/endsAt, buffer/turnover-inclusive)
// crosses midnight while the matched booking's own scheduledAt stays on the previous day. The
// grid's vertical range is business-hours-bound (schedule-timeline-window.ts), so repositioning
// the block itself would render it off-grid for any tenant not open at midnight — this is
// rendered as a fixed, non-positioned indicator instead of a timeline block.
export interface SpilloverOccupancyIndicator {
  readonly bookingId: string;
  readonly contactName: string;
  readonly endsAtLocalTime: string; // "HH:MM" in tenant timezone, from the block's own endsAt
}

export interface ScheduleResourceColumn {
  readonly resourceId: string;
  readonly resourceName: string;
  readonly timeline: TimelineDayData;
  // TD44 Story 3 — true when this column should render its own hour-label column (either it opted
  // out of the shared axis — an exceptional opening — or it's the first member of the shared
  // group). false means a sibling column already renders the shared label column for this group.
  readonly rendersOwnLabelColumn: boolean;
  readonly spilloverOccupancy: readonly SpilloverOccupancyIndicator[];
}

interface BuildResourceColumnsInput {
  readonly selectedResourceIds: ReadonlySet<string>;
  readonly resourceNameById: ReadonlyMap<string, string>;
  readonly dayGridColumns: readonly DayGridColumn[];
  // The full, status-unfiltered week bookings list — deliberately NOT the same `visibleBookings`
  // the single timeline uses, so the status filter can be re-applied per matched booking below
  // (see resolveResourceBookings's own note) instead of losing the distinction between "excluded
  // by the status filter" and "genuinely missing".
  readonly bookings: readonly StaffBookingCardResponse[];
  readonly selectedStatusSet: ReadonlySet<BookingStatus>;
  readonly closures: readonly ScheduleClosure[];
  readonly openings: readonly ScheduleOpening[];
  readonly selectedDateKey: string;
  readonly timezone: string;
  readonly slotGranularityMinutes: number;
  readonly businessHours: TenantBusinessHours;
  readonly placeholderBookingLabel: string;
}

const PLACEHOLDER_STATUS = 'APPROVED';

// A day-grid BOOKING block whose refId has no match anywhere in the full week-bookings list
// (shouldn't normally happen — same tenant, same day) falls back to a generic placeholder built
// from the block's own timing, rather than being silently dropped or crashing the column.
function buildPlaceholderBooking(
  block: DayGridColumn['blocks'][number],
  placeholderLabel: string,
): StaffBookingCardResponse {
  const durationMins = Math.max(
    1,
    Math.round((new Date(block.endsAt).getTime() - new Date(block.startsAt).getTime()) / 60_000),
  );
  return {
    bookingId: block.refId,
    status: PLACEHOLDER_STATUS,
    scheduledAt: block.startsAt,
    contactName: placeholderLabel,
    serviceNames: [],
    totalPrice: { amount: 0, currency: 'BRL' },
    totalDurationMins: durationMins,
    isCustomer: false,
    assignedResources: [],
  };
}

interface ResolvedResourceBlocks {
  readonly bookings: StaffBookingCardResponse[];
  readonly spillover: SpilloverOccupancyIndicator[];
  readonly bufferTails: BufferTail[];
}

// Day-grid is used purely as a resourceId -> booking-id lookup here — CLASS_SESSION blocks are
// unreachable before M24 (nothing generates class_sessions rows yet) and are ignored, not handled.
//
// A matched booking must still respect the page's status filter, same as the single timeline —
// day-grid itself has no status concept and includes REQUESTED/HOLD/COMMITTED occupancy
// regardless of what's checked in "Filtrar status" (M22-S05). Looking the refId up against the
// FULL bookings list (not the already status-filtered one) lets a real match whose status is
// unchecked be excluded outright, instead of falling through to the placeholder fallback and
// showing a hidden booking as a fake "Ocupado" block. The placeholder itself is reserved for a
// refId with no match at all — a genuine data gap, not a filtered-out one.
//
// TD43 — a matched booking whose own day (getBookingDateKey, from scheduledAt) differs from this
// column's selectedDateKey is a spillover: day-grid correctly reports the resource occupied here
// (its buffer/turnover pushed the raw interval past midnight), but the booking itself belongs to
// the previous day's column. Routed to the spillover bucket instead of the timeline's own bookings
// list — see SpilloverOccupancyIndicator's own note for why it isn't rendered as a positioned
// block. Only applies to a real match; an unmatched refId still falls through to the placeholder
// path unchanged (a separate, pre-existing "shouldn't normally happen" case, out of this fix's
// scope).
function resolveResourceBookings(
  dayGridColumn: DayGridColumn | undefined,
  bookingById: ReadonlyMap<string, StaffBookingCardResponse>,
  selectedStatusSet: ReadonlySet<BookingStatus>,
  placeholderLabel: string,
  selectedDateKey: string,
  timezone: string,
  resourceName: string,
): ResolvedResourceBlocks {
  if (!dayGridColumn) return { bookings: [], spillover: [], bufferTails: [] };
  const bookings: StaffBookingCardResponse[] = [];
  const spillover: SpilloverOccupancyIndicator[] = [];
  const tails = new Map<string, BufferTail>();
  for (const block of dayGridColumn.blocks) {
    if (block.kind !== 'BOOKING') continue;
    const match = bookingById.get(block.refId);
    if (match) {
      if (!selectedStatusSet.has(match.status)) continue;
      if (getBookingDateKey(match, timezone) === selectedDateKey) {
        bookings.push(match);
        keepLongestTail(tails, resolveBufferTail(match, block, resourceName, timezone));
      } else {
        spillover.push({
          bookingId: match.bookingId,
          contactName: match.contactName,
          endsAtLocalTime: getLocalTimeKey(new Date(block.endsAt), timezone),
        });
      }
      continue;
    }
    bookings.push(buildPlaceholderBooking(block, placeholderLabel));
  }
  return { bookings, spillover, bufferTails: [...tails.values()] };
}

// A resource's own closures/openings, plus every tenant-wide one (resourceId === null) — a
// tenant-wide closure blocks every resource, so it renders inside every checked resource's column
// too (resolved during M22-S06's own story-discovery, 2026-09-24).
function scopeToResource<T extends { readonly resourceId: string | null }>(
  items: readonly T[],
  resourceId: string,
): T[] {
  return items.filter((item) => item.resourceId === resourceId || item.resourceId === null);
}

type UnwindowedColumn = Omit<ScheduleResourceColumn, 'rendersOwnLabelColumn'>;

// TD44 Story 3 — resolve the shared hour axis across every checked resource's regular-hours
// window, then reposition each shared member's grid against it. A column overridden by an
// exceptional opening (or closed) opts out entirely and keeps its own independently-resolved
// timeline, unchanged. Extracted from buildResourceColumns below purely to stay under the
// 40-line function cap once this story's shared-window step landed there.
function applySharedWindowToColumns(
  columns: readonly UnwindowedColumn[],
  slotGranularityMinutes: number,
): ScheduleResourceColumn[] {
  const sharedWindow = resolveSharedTimelineWindow(columns.map((column) => column.timeline));

  return columns.map((column, index) => ({
    ...column,
    timeline: sharedWindow.sharedMemberIndexes.has(index)
      ? applySharedTimelineWindow(
          column.timeline,
          sharedWindow.sharedStartMinutes,
          sharedWindow.sharedEndMinutes,
          slotGranularityMinutes,
        )
      : column.timeline,
    rendersOwnLabelColumn: rendersOwnLabelColumn(index, sharedWindow.sharedMemberIndexes),
  }));
}

// Turns the day-grid response (a resourceId -> booking-id lookup only) plus the page's
// already-fetched bookings/closures/openings into one TimelineDayData per checked resource,
// feeding the exact same buildTimelineDayData the single merged timeline already uses — no new
// block-rendering logic. Columns are ordered alphabetically by resource name for a stable layout
// regardless of check order. resourceNameById is intentionally not passed into
// buildTimelineDayData here: a per-block resource-name badge would be redundant when the column
// itself already identifies the resource.
export function buildResourceColumns(input: BuildResourceColumnsInput): ScheduleResourceColumn[] {
  const bookingById = new Map(input.bookings.map((booking) => [booking.bookingId, booking]));
  const dayGridColumnByResourceId = new Map(
    input.dayGridColumns.map((column) => [column.resourceId, column]),
  );

  const columns: UnwindowedColumn[] = [...input.selectedResourceIds]
    .map((resourceId) => ({
      resourceId,
      resourceName: input.resourceNameById.get(resourceId) ?? resourceId,
    }))
    .sort((a, b) => a.resourceName.localeCompare(b.resourceName))
    .map(({ resourceId, resourceName }) => {
      const {
        bookings: resourceBookings,
        spillover,
        bufferTails,
      } = resolveResourceBookings(
        dayGridColumnByResourceId.get(resourceId),
        bookingById,
        input.selectedStatusSet,
        input.placeholderBookingLabel,
        input.selectedDateKey,
        input.timezone,
        resourceName,
      );

      const timeline = buildTimelineDayData({
        selectedDateKey: input.selectedDateKey,
        timezone: input.timezone,
        slotGranularityMinutes: input.slotGranularityMinutes,
        businessHours: input.businessHours,
        bookings: resourceBookings,
        closures: scopeToResource(input.closures, resourceId),
        openings: scopeToResource(input.openings, resourceId),
        bufferTails,
      });

      return { resourceId, resourceName, timeline, spilloverOccupancy: spillover };
    });

  return applySharedWindowToColumns(columns, input.slotGranularityMinutes);
}
