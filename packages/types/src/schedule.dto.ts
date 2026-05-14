import type { ClosureReason } from './enums';

export interface CreateClosureRequest {
  date: string; // ISO-8601 date "YYYY-MM-DD"
  reason: ClosureReason;
  note?: string;
}

export interface ClosureResponse {
  id: string;
  tenantId: string;
  date: string;
  reason: ClosureReason;
  note?: string;
  createdAt: string;
}

export interface AvailabilitySlot {
  startTime: string; // ISO-8601 datetime
  endTime: string;
  available: boolean;
}

export interface AvailabilityResponse {
  date: string;
  tenantId: string;
  slots: AvailabilitySlot[];
}
