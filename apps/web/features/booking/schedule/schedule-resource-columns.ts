import type {
  DayGridColumn,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import {
  buildTimelineDayData,
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
  readonly bookings: readonly StaffBookingCardResponse[];
  readonly closures: readonly ScheduleClosure[];
  readonly openings: readonly ScheduleOpening[];
  readonly selectedDateKey: string;
  readonly timezone: string;
  readonly slotGranularityMinutes: number;
  readonly businessHours: TenantBusinessHours;
  readonly placeholderBookingLabel: string;
}

const PLACEHOLDER_STATUS = 'APPROVED';

// A day-grid BOOKING block whose refId has no match in the already-fetched week-bookings list
// (shouldn't normally happen — same tenant, same day) falls back to a generic placeholder built
// from the block's own timing, rather than being silently dropped or crashing the column.
function resolveBlockBooking(
  block: DayGridColumn['blocks'][number],
  bookingById: ReadonlyMap<string, StaffBookingCardResponse>,
  placeholderLabel: string,
): StaffBookingCardResponse {
  const match = bookingById.get(block.refId);
  if (match) return match;

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
function resolveResourceBookings(
  dayGridColumn: DayGridColumn | undefined,
  bookingById: ReadonlyMap<string, StaffBookingCardResponse>,
  placeholderLabel: string,
): StaffBookingCardResponse[] {
  if (!dayGridColumn) return [];
  return dayGridColumn.blocks
    .filter((block) => block.kind === 'BOOKING')
    .map((block) => resolveBlockBooking(block, bookingById, placeholderLabel));
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
      });

      return { resourceId, resourceName, timeline };
    });
}
