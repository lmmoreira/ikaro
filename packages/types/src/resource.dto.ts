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

// Staff candidates for a STAFF-type resource's picker, pre-merged server-side (BFF composes
// Staff + Resource reads and computes isWrapped) rather than in the browser — the BFF, not
// apps/web, owns multi-read composition (docs/24-BFF_ARCHITECTURE.md § Web-facing composite
// views).
export interface ResourceStaffOptionItem {
  id: string;
  name: string | null;
  email: string;
  isActive: boolean;
  // Already wrapped by a different Resource (excludeResourceId is never counted as a conflict
  // against itself — same semantic as StaffWrapValidationService.assertWrappable's own param).
  isWrapped: boolean;
}

export interface ResourceStaffOptionsResponse {
  items: ResourceStaffOptionItem[];
}
