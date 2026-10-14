import type { MoneyAmount } from './money';

// UC-073/UC-077 — the manager's "Reservas a resolver" worklist (M23-S08 backend, M23-S14 page).
// One entry per future booking a resource deactivation left needing a decision.

export interface SchedulingExceptionAlternative {
  resourceId: string;
  resourceName: string;
}

// The Booking context's own summary of the affected booking (no Customer-context call). The
// entry's `booking` is null only when the booking cannot be read.
export interface SchedulingExceptionBookingSummary {
  contactName: string;
  scheduledAt: string;
  totalDurationMins: number;
  serviceNames: string[];
  status: string;
  // The resource the entry is about (the deactivated one), null when it cannot be read.
  resourceName: string | null;
  // true = a registered customer's booking; false = a guest (the queue card's Cliente/Visitante pill).
  isCustomer: boolean;
  totalPrice: MoneyAmount;
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

// The sidebar badge: how many entries still wait for the manager's decision.
export interface SchedulingExceptionCountResponse {
  count: number;
}

// Best-effort per entry: `STILL_OPEN` with the reason as `errorCode` when an entry could not be
// resolved (its alternative was taken, the booking changed, it was already closed).
export interface SchedulingExceptionResultItem {
  exceptionId: string;
  outcome: 'RESOLVED' | 'STILL_OPEN';
  errorCode?: string;
}

export interface SchedulingExceptionBulkResultResponse {
  results: SchedulingExceptionResultItem[];
}
