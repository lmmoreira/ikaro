import type { StaffRole } from './enums';

export interface StaffResponse {
  id: string;
  email: string;
  name: string | null;
  role: StaffRole;
  isActive: boolean;
  createdAt: string;
}

// Derived by the BFF from backend data (M13-S32): ACTIVE = isActive; PENDING = never
// accepted the invite; DEACTIVATED = activated once, then deactivated.
export type StaffStatus = 'ACTIVE' | 'PENDING' | 'DEACTIVATED';

export interface StaffListItem extends StaffResponse {
  status: StaffStatus;
}

export interface StaffListResponse {
  items: StaffListItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}

export interface InviteStaffRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
}

export interface InviteStaffResponse {
  staffId: string;
  email: string;
  role: StaffRole;
  isActive: false;
}

export interface DeactivateStaffResponse {
  staffId: string;
  isActive: false;
}

export interface ActivateStaffResponse {
  staffId: string;
  isActive: true;
}

export interface UpdateStaffRequest {
  name: string;
  role: StaffRole;
}

export interface UpdateStaffResponse {
  staffId: string;
  name: string;
  role: StaffRole;
}
