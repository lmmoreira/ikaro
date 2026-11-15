import { EntityManager } from 'typeorm';
import { BookingStatus } from '../../domain/booking.aggregate';

// Split out of typeorm-booking.repository.ts to keep it under the file-length cap. The distinct
// logged-in customers that hold an APPROVED booking starting after `after`, one keyset page at a
// time (ordered by customer_id, strictly after `afterCustomerId`), never the bookings themselves:
// a tenant can have thousands of customers, and loading every aggregate to find them would grow
// with the tenant. Tenant-scoped on the (tenant_id, status) index; a guest booking has no
// customer_id and is excluded.
export async function queryCustomerIdsWithApprovedBookingsAfter(
  manager: Pick<EntityManager, 'query'>,
  tenantId: string,
  after: Date,
  afterCustomerId: string | null,
  limit: number,
): Promise<string[]> {
  const rows: Array<{ customer_id: string }> = await manager.query(
    `
    SELECT DISTINCT b.customer_id
    FROM booking.bookings b
    WHERE b.tenant_id = $1
      AND b.status = $2
      AND b.customer_id IS NOT NULL
      AND b.scheduled_at > $3
      AND ($4::uuid IS NULL OR b.customer_id > $4::uuid)
    ORDER BY b.customer_id
    LIMIT $5
    `,
    [tenantId, BookingStatus.APPROVED, after, afterCustomerId, limit],
  );
  return rows.map((row) => row.customer_id);
}
