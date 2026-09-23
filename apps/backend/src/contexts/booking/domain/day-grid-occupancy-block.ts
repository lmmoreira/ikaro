// Result shape for IBookingAvailabilityPort.findDayGridOccupancy() (UC-057, M22-S05). Distinct
// from ResourceOccupiedSlot: this carries `kind`/`refId` so the manager can drill into the
// underlying booking/session, and deliberately includes REQUESTED-state rows (excluded from
// findOccupancyByTenantAndResource) — see docs/13-DATABASE_SCHEMA.md's resource_occupancy
// EXCLUDE constraint note.
export interface DayGridOccupancyBlock {
  resourceId: string;
  startsAt: Date; // UTC
  endsAt: Date; // UTC — includes the effective service buffer / resource turnover (UC-059)
  kind: 'BOOKING' | 'CLASS_SESSION'; // always 'BOOKING' until M24 ships class_sessions
  refId: string; // bookingId for 'BOOKING'; classSessionId for 'CLASS_SESSION' (inert until M24)
}
