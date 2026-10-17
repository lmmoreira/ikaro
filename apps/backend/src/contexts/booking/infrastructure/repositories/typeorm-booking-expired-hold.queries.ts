import { EntityManager } from 'typeorm';
import { BookingStatus } from '../../domain/booking.aggregate';

// Split out of typeorm-booking.repository.ts to keep it under the file-length cap — the TD51
// sweep for ExpireBookingHoldsJob. Booking ids only (the repository then loads them the usual
// way); tenant-scoped on every hop and on the partial (tenant_id, hold_expires_at) WHERE
// lock_state = 'HOLD' index, which is why the lock_state filter is spelled out.
export async function queryPendingBookingIdsWithExpiredHold(
  manager: Pick<EntityManager, 'query'>,
  tenantId: string,
  now: Date,
): Promise<string[]> {
  const rows: Array<{ booking_id: string }> = await manager.query(
    `
    SELECT DISTINCT bl.booking_id
    FROM booking.resource_occupancy ro
    JOIN booking.booking_line_resource_assignments bla
      ON bla.tenant_id = ro.tenant_id AND bla.id = ro.booking_line_resource_assignment_id
    JOIN booking.booking_lines bl
      ON bl.tenant_id = bla.tenant_id AND bl.line_id = bla.booking_line_id
    JOIN booking.bookings b
      ON b.tenant_id = bl.tenant_id AND b.id = bl.booking_id
    WHERE ro.tenant_id = $1
      AND ro.lock_state = 'HOLD'
      AND ro.hold_expires_at <= $2
      AND b.status = $3
    `,
    [tenantId, now, BookingStatus.PENDING],
  );
  return rows.map((row) => row.booking_id);
}
