import { StaffListItem, StaffListResponse, StaffStatus } from '@ikaro/types';
import { StaffItem, StaffItemListResponse } from './staff.types';

// googleOAuthId is set once at UC-025 activation and never cleared by deactivate(),
// so null reliably means "never accepted the invite" (see equipe dev-notes).
export function deriveStaffStatus(item: StaffItem): StaffStatus {
  if (item.isActive) return 'ACTIVE';
  return item.googleOAuthId === null ? 'PENDING' : 'DEACTIVATED';
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
