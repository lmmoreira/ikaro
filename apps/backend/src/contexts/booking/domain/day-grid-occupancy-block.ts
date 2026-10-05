import { ResourceGapSource } from './resource-gap-source';

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
  // Why endsAt extends past the booking's own end (M18-S10); null for a CLASS_SESSION or a row with
  // no recorded gap (no gap, or written before the gap columns existed). serviceName is the booking
  // line's own service_name_at_booking snapshot, set only for SERVICE_BUFFER.
  gap: { source: ResourceGapSource; minutes: number; serviceName: string | null } | null;
  refId: string; // bookingId for 'BOOKING'; classSessionId for 'CLASS_SESSION' (inert until M24)
}
