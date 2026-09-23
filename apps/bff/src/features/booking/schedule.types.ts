import { ClosureReason, ResourceType } from '@ikaro/types';

export interface ScheduleClosureResponse {
  id: string;
  resourceId: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: ClosureReason;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ScheduleClosureListResponse {
  items: ScheduleClosureResponse[];
}

export interface ScheduleOpeningResponse {
  id: string;
  resourceId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ScheduleOpeningListResponse {
  items: ScheduleOpeningResponse[];
}

export interface AvailableSlot {
  startsAt: string;
  endsAt: string;
}

export interface AvailabilityResponse {
  date: string;
  slots: AvailableSlot[];
  available: boolean;
}

export interface DaySummary {
  date: string;
  available: boolean;
  slotCount: number;
}

export type AvailabilitySummaryResponse = DaySummary[];

export interface DayGridBlock {
  startsAt: string;
  endsAt: string;
  kind: 'BOOKING' | 'CLASS_SESSION';
  refId: string;
}

export interface DayGridColumn {
  resourceId: string;
  name: string;
  type: ResourceType;
  blocks: DayGridBlock[];
}

export interface DayGridResponse {
  date: string;
  columns: DayGridColumn[];
}
