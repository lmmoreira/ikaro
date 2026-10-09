// The list item and list response are shared with the web (one definition, @ikaro/types).
export type {
  RecurringBookingScheduleListItem,
  RecurringBookingScheduleListResponse,
} from '@ikaro/types';

export interface RecurringBookingScheduleResponse {
  id: string;
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  approvalHoldExpiresAt: string | null;
}

export interface ApproveRecurringBookingScheduleResponse {
  id: string;
  status: 'ACTIVE';
  occurrenceCount: number;
}

export interface RejectRecurringBookingScheduleResponse {
  id: string;
  status: 'CANCELLED';
}

export interface EndRecurringBookingScheduleResponse {
  id: string;
  status: 'CANCELLED';
  cancelledBookingIds: string[];
}
