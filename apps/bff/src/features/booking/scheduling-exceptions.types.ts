export interface SchedulingExceptionAlternative {
  resourceId: string;
  resourceName: string;
}

// The Booking context's own summary of the affected booking (no Customer-context call). null only
// when the booking cannot be read.
export interface SchedulingExceptionBookingSummary {
  contactName: string;
  scheduledAt: string;
  totalDurationMins: number;
  serviceNames: string[];
  status: string;
  resourceName: string | null;
}

export interface SchedulingExceptionItem {
  id: string;
  sourceType: 'RESOURCE_DEACTIVATION';
  sourceId: string;
  affectedType: 'BOOKING';
  affectedId: string;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  alternatives: SchedulingExceptionAlternative[];
  createdAt: string;
  booking: SchedulingExceptionBookingSummary | null;
}

export interface SchedulingExceptionListResponse {
  items: SchedulingExceptionItem[];
}

// Best-effort per entry: `STILL_OPEN` with the reason as `errorCode` when an entry could not be
// resolved (its alternative was taken, the booking changed, it was already closed).
export interface SchedulingExceptionBulkResultResponse {
  results: {
    exceptionId: string;
    outcome: 'RESOLVED' | 'STILL_OPEN';
    errorCode?: string;
  }[];
}
