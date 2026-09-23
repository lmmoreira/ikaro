import { ResourceOccupiedSlot } from '../../domain/resource-occupied-slot';
import { DayGridOccupancyBlock } from '../../domain/day-grid-occupancy-block';

export const BOOKING_AVAILABILITY_PORT = Symbol('IBookingAvailabilityPort');

export interface IBookingAvailabilityPort {
  // `from`/`to` are tenant-local calendar dates (YYYY-MM-DD) — `timezone` is required so the
  // adapter can convert them to real UTC instant boundaries against the UTC-stored starts_at/
  // ends_at columns, not re-interpret the strings as if they were already UTC days.
  findOccupancyByTenantAndResource(
    tenantId: string,
    resourceIds: string[],
    from: string,
    to: string,
    timezone: string,
  ): Promise<ResourceOccupiedSlot[]>;

  // UC-057 (M22-S05) — the manager's combined multi-resource day grid. Deliberately a separate
  // method from findOccupancyByTenantAndResource above, not a shared one with an extra flag:
  // this one (a) includes REQUESTED-state rows (a PENDING booking on a degenerate/LOCATION-
  // fallback service) alongside HOLD/COMMITTED, since the day grid is REQUESTED's only reader
  // anywhere in the codebase (docs/13-DATABASE_SCHEMA.md's resource_occupancy EXCLUDE constraint
  // note), and (b) resolves `refId` (the booking/session id to drill into), which the
  // availability-computation callers of the method above never need. `date` is a single
  // tenant-local calendar date (YYYY-MM-DD); `timezone` converts it the same way as above.
  findDayGridOccupancy(
    tenantId: string,
    resourceIds: string[],
    date: string,
    timezone: string,
  ): Promise<DayGridOccupancyBlock[]>;
}
