import type { StaffRole } from './enums';

export interface StaffResponse {
  id: string;
  email: string;
  name: string | null;
  role: StaffRole;
  isActive: boolean;
  createdAt: string;
}

export interface StaffListResponse {
  items: StaffResponse[];
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
