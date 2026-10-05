export type AvailabilityAlertCriteriaType = 'ONE_TIME_RANGE' | 'WEEKLY_PREFERENCE';
export type AvailabilityAlertStatus = 'ACTIVE' | 'NOTIFIED' | 'CANCELLED' | 'EXPIRED';
export type AvailabilityAlertWeekday =
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

// One alert as the backend returns it (UC-072/UC-076). Exactly one criteria set is populated: the
// range pair for ONE_TIME_RANGE, the weekdays + local times for WEEKLY_PREFERENCE, the others null.
export interface AvailabilityAlertResponse {
  id: string;
  serviceId: string;
  preferredResourceId: string | null;
  criteriaType: AvailabilityAlertCriteriaType;
  timezone: string;
  acceptableStartAt: string | null;
  acceptableEndAt: string | null;
  weekdays: AvailabilityAlertWeekday[] | null;
  localStartTime: string | null;
  localEndTime: string | null;
  durationMinutes: number | null;
  participantCount: number | null;
  status: AvailabilityAlertStatus;
  expiresAt: string;
  createdAt: string;
}

export interface AvailabilityAlertListResponse {
  items: AvailabilityAlertResponse[];
}

export interface CancelAvailabilityAlertResponse {
  id: string;
  status: 'CANCELLED';
}
