import { ResourceOccupiedSlot } from '../../domain/resource-occupied-slot';

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
}
