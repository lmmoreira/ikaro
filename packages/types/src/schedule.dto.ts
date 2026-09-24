import type { ClosureReason, ResourceType } from './enums';

export interface ScheduleClosure {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: ClosureReason;
  notes: string | null;
  resourceId: string | null;
}

export interface ScheduleClosureListResponse {
  items: ScheduleClosure[];
}

export interface CreateClosureRequest {
  date: string;
  reason: ClosureReason;
  startTime?: string;
  endTime?: string;
  notes?: string;
  resourceId?: string;
}

export interface ScheduleOpening {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  resourceId: string | null;
}

export interface ScheduleOpeningListResponse {
  items: ScheduleOpening[];
}

export interface CreateOpeningRequest {
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  resourceId?: string;
}

export interface AvailableSlot {
  startsAt: string; // ISO-8601 datetime
  endsAt: string; // ISO-8601 datetime
}

export interface AvailabilityResponse {
  date: string; // YYYY-MM-DD
  slots: AvailableSlot[];
  available: boolean;
}

export interface DaySummary {
  date: string; // YYYY-MM-DD
  available: boolean;
  slotCount: number;
}

export type AvailabilitySummaryResponse = DaySummary[];

export interface DayGridBlock {
  startsAt: string; // ISO-8601 datetime
  endsAt: string; // ISO-8601 datetime
  kind: 'BOOKING' | 'CLASS_SESSION'; // CLASS_SESSION unreachable before M24
  refId: string;
}

export interface DayGridColumn {
  resourceId: string;
  name: string;
  type: ResourceType;
  blocks: DayGridBlock[];
}

export interface DayGridResponse {
  date: string; // YYYY-MM-DD
  columns: DayGridColumn[];
}
