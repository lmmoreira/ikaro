import type {
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
  TenantBusinessHours,
} from '@ikaro/types';

export interface SchedulePageControllerInput {
  readonly initialClosures: ScheduleClosureListResponse;
  readonly initialOpenings: ScheduleOpeningListResponse;
  readonly initialBookings: StaffBookingListResponse;
  readonly businessHours: TenantBusinessHours;
  readonly todayKey: string;
  readonly weekStartKey: string;
  readonly initialSelectedDateKey?: string;
  readonly slotGranularityMinutes: 15 | 30 | 60;
}
