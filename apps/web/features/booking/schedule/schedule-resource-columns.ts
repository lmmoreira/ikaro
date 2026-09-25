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
  DESKTOP_MIN_BLOCK_HEIGHT_PX,
  type TimelineDayData,
} from '@/features/booking/schedule/schedule-timeline';

export interface ScheduleResourceColumn {
  readonly resourceId: string;
  readonly resourceName: string;
  readonly timeline: TimelineDayData;
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
  };
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
function resolveResourceBookings(
  dayGridColumn: DayGridColumn | undefined,
  bookingById: ReadonlyMap<string, StaffBookingCardResponse>,
  selectedStatusSet: ReadonlySet<BookingStatus>,
  placeholderLabel: string,
): StaffBookingCardResponse[] {
  if (!dayGridColumn) return [];
  const resolved: StaffBookingCardResponse[] = [];
  for (const block of dayGridColumn.blocks) {
    if (block.kind !== 'BOOKING') continue;
    const match = bookingById.get(block.refId);
    if (match) {
      if (selectedStatusSet.has(match.status)) resolved.push(match);
      continue;
    }
    resolved.push(buildPlaceholderBooking(block, placeholderLabel));
  }
  return resolved;
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

  return [...input.selectedResourceIds]
    .map((resourceId) => ({
      resourceId,
      resourceName: input.resourceNameById.get(resourceId) ?? resourceId,
    }))
    .sort((a, b) => a.resourceName.localeCompare(b.resourceName))
    .map(({ resourceId, resourceName }) => {
      const resourceBookings = resolveResourceBookings(
        dayGridColumnByResourceId.get(resourceId),
        bookingById,
        input.selectedStatusSet,
        input.placeholderBookingLabel,
      );

      const timeline = buildTimelineDayData({
        selectedDateKey: input.selectedDateKey,
        timezone: input.timezone,
        slotGranularityMinutes: input.slotGranularityMinutes,
        businessHours: input.businessHours,
        bookings: resourceBookings,
        closures: scopeToResource(input.closures, resourceId),
        openings: scopeToResource(input.openings, resourceId),
        minSlotHeightPx: DESKTOP_MIN_BLOCK_HEIGHT_PX,
      });

      return { resourceId, resourceName, timeline };
    });
}
