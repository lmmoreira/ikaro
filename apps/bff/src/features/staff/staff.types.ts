// Backend response shapes for the staff module. `googleOAuthId` is internal —
// the mapper derives a display status from it and strips it before the response
// reaches the frontend (M13-S32).

import type { StaffRole } from '@ikaro/types';

export interface StaffItem {
  id: string;
  email: string;
  name: string | null;
  role: StaffRole;
  isActive: boolean;
  googleOAuthId: string | null;
  createdAt: string;
}

export interface StaffItemListResponse {
  items: StaffItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
  };
}
