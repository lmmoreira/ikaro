// The list item, the list response and the approve/reject responses are shared with the web (one
// definition each, @ikaro/types) — the staff approval screen (M23-S13) reads them.
export type {
  ApproveRecurringBookingScheduleResponse,
  RecurringBookingScheduleListItem,
  RecurringBookingScheduleListResponse,
  RejectRecurringBookingScheduleResponse,
} from '@ikaro/types';

export interface RecurringBookingScheduleResponse {
  id: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  approvalHoldExpiresAt: string | null;
}

export interface EndRecurringBookingScheduleResponse {
  id: string;
  status: 'CANCELLED';
  cancelledBookingIds: string[];
}
