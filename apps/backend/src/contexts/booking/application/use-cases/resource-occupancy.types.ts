import { ResourceType } from '../../domain/resource.types';

export interface BookingLineForResolution {
  lineId: string;
  serviceId: string;
  durationMinsAtBooking: number;
}

// One customer-chosen resource for one CUSTOMER_CHOICE requirement (M23-S01). legIndex is null
// for a flat (non-legged) requirement, matching ResourceOccupancyCandidate's own shape.
// resourceType disambiguates within a bundle (more than one requirement on the same line/leg).
// AUTO_ANY/AUTO_FUNGIBLE_POOL/NONE requirements never consult these — a selection entry for one
// of those is simply ignored, never an error, so approve-booking/reschedule-booking's "replay
// every existing assignment regardless of its original selectionMode" re-resolution stays safe.
export interface ResourceSelectionInput {
  serviceId: string;
  legIndex: number | null;
  resourceType: ResourceType;
  resourceId: string;
}
