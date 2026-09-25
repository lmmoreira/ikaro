import { BookingResourceAssignmentSummary } from '../../application/ports/booking-repository.port';

// Extracted from typeorm-booking.repository.ts purely to stay under the file-length/function-length
// caps — the raw-row-to-map grouping is a self-contained, pure transformation independent of the
// query that produces the rows.
export interface ResourceAssignmentRow {
  bookingId: string;
  resourceId: string;
  resourceType: BookingResourceAssignmentSummary['resourceType'];
  resourceName: string;
}

// Deduplicated by resourceId per booking — a resource assigned across 2+ lines/legs of the same
// booking is listed once, not once per line.
export function groupResourceAssignmentsByBookingId(
  rows: readonly ResourceAssignmentRow[],
): Map<string, BookingResourceAssignmentSummary[]> {
  const resourceAssignmentsByBookingId = new Map<string, BookingResourceAssignmentSummary[]>();
  const seenResourceIdsByBookingId = new Map<string, Set<string>>();

  for (const row of rows) {
    const seenResourceIds = seenResourceIdsByBookingId.get(row.bookingId) ?? new Set<string>();
    if (seenResourceIds.has(row.resourceId)) continue;
    seenResourceIds.add(row.resourceId);
    seenResourceIdsByBookingId.set(row.bookingId, seenResourceIds);

    const list = resourceAssignmentsByBookingId.get(row.bookingId) ?? [];
    list.push({
      resourceId: row.resourceId,
      resourceType: row.resourceType,
      resourceName: row.resourceName,
    });
    resourceAssignmentsByBookingId.set(row.bookingId, list);
  }

  return resourceAssignmentsByBookingId;
}
