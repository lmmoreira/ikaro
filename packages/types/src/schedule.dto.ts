import type { ClosureReason } from './enums';

export interface ScheduleClosure {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: ClosureReason;
  notes: string | null;
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
}

export interface ScheduleOpening {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string | null;
}

export interface ScheduleOpeningListResponse {
  items: ScheduleOpening[];
}

export interface CreateOpeningRequest {
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
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
