// Replaces BookedSlot (M22-S03) — the old tenant-wide, single-window shape can no longer answer
// "is resource X free" once a booking can span a bundle or leg chain with a different sub-window
// per resource (docs/02-DOMAIN_MODEL.md § IBookingAvailabilityPort, Changed by M22 Cluster 2).
export interface ResourceOccupiedSlot {
  resourceId: string;
  startsAt: Date; // UTC
  endsAt: Date; // UTC — includes the effective service buffer / resource turnover (UC-059)
}
