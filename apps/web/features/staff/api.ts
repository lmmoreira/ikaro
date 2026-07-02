import type {
  DeactivateStaffResponse,
  InviteStaffRequest,
  InviteStaffResponse,
  StaffListResponse,
  StaffResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

export interface StaffListQuery {
  readonly limit?: number;
  readonly offset?: number;
}

export async function listStaff(query?: StaffListQuery): Promise<StaffListResponse> {
  const res = await bffClient.get<StaffListResponse>('/staff', { params: query });
  return res.data;
}

export async function getStaffMember(id: string): Promise<StaffResponse> {
  const res = await bffClient.get<StaffResponse>(`/staff/${id}`);
  return res.data;
}

export async function inviteStaff(body: InviteStaffRequest): Promise<InviteStaffResponse> {
  const res = await bffClient.post<InviteStaffResponse>('/staff/invite', body);
  return res.data;
}

export async function deactivateStaff(id: string): Promise<DeactivateStaffResponse> {
  const res = await bffClient.patch<DeactivateStaffResponse>(`/staff/${id}/deactivate`, {});
  return res.data;
}
