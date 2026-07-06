import { StaffListItem, StaffListResponse, StaffStatus } from '@ikaro/types';
import { StaffItem, StaffItemListResponse } from './staff.types';

// googleOAuthId is set once at UC-025 activation and never cleared by deactivate(). Since
// M13-S13, Staff.invite() provisions every row as isActive=true from the start (security
// fix — is_active=false could previously be bypassed), so a fresh invite already has
// isActive=true *and* googleOAuthId=null. googleOAuthId is the real "ever completed
// activation" signal and must be checked first — checking isActive first would classify
// a brand-new, never-logged-in invite as ACTIVE instead of PENDING.
export function deriveStaffStatus(item: StaffItem): StaffStatus {
  if (item.googleOAuthId === null) return 'PENDING';
  return item.isActive ? 'ACTIVE' : 'DEACTIVATED';
}

export function toStaffListItem(item: StaffItem): StaffListItem {
  return {
    id: item.id,
    email: item.email,
    name: item.name,
    role: item.role,
    isActive: item.isActive,
    createdAt: item.createdAt,
    status: deriveStaffStatus(item),
  };
}

export function toStaffListResponse(source: StaffItemListResponse): StaffListResponse {
  return {
    items: source.items.map(toStaffListItem),
    pagination: source.pagination,
  };
}
