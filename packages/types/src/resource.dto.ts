import type { ResourceType } from './enums';

export interface DayHours {
  open: string;
  close: string;
}

export interface ResourceWorkingHours {
  monday: DayHours | null;
  tuesday: DayHours | null;
  wednesday: DayHours | null;
  thursday: DayHours | null;
  friday: DayHours | null;
  saturday: DayHours | null;
  sunday: DayHours | null;
}

export interface ResourceResponse {
  id: string;
  type: ResourceType;
  refId: string | null;
  name: string;
  workingHours: ResourceWorkingHours | null;
  turnoverMinutes: number;
  maxCapacity: number | null;
  isActive: boolean;
}

export interface ResourceListResponse {
  items: ResourceResponse[];
}

export interface CreateResourceRequest {
  type: ResourceType;
  refId?: string;
  name: string;
  workingHours?: ResourceWorkingHours | null;
  turnoverMinutes?: number;
  maxCapacity?: number | null;
}

// Every field independently optional (PATCH semantics) — mirrors @ikaro/validation's
// UpdateResourceSchema, shared verbatim between backend and BFF.
export interface UpdateResourceRequest {
  name?: string;
  type?: ResourceType;
  refId?: string | null;
  workingHours?: ResourceWorkingHours | null;
  turnoverMinutes?: number;
  maxCapacity?: number | null;
}
