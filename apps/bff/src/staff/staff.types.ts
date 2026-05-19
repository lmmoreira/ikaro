export interface InviteStaffResponse {
  staffId: string;
  email: string;
  role: 'MANAGER' | 'STAFF';
  isActive: false;
}

export interface DeactivateStaffResponse {
  staffId: string;
  isActive: false;
}

export interface StaffResponse {
  id: string;
  email: string;
  name: string | null;
  role: 'MANAGER' | 'STAFF';
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
