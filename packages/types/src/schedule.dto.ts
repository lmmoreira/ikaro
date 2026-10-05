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
  // Why endsAt extends past the booking's own end (M18-S10): the time this resource stays held
  // after the booking, and whose rule holds it. null = no gap, or a row written before the gap
  // was recorded ("origin not recorded" when endsAt still runs past the booking's end).
  // serviceName is the booking line's own service-name snapshot, set only for SERVICE_BUFFER.
  gap: DayGridBlockGap | null;
}

export type DayGridGapSource = 'SERVICE_BUFFER' | 'RESOURCE_TURNOVER';

export interface DayGridBlockGap {
  source: DayGridGapSource;
  minutes: number;
  serviceName: string | null;
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
