import type { StaffRole } from './enums';

export interface InviteStaffRequest {
  email: string;
  name: string;
  role: StaffRole;
}

export interface StaffResponse {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
  createdAt: string;
}
