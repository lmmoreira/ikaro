import type {
  DeactivateStaffResponse,
  InviteStaffRequest,
  InviteStaffResponse,
  StaffListResponse,
  StaffResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

export interface StaffListQuery {
  readonly limit?: number;
  readonly offset?: number;
}

export async function listStaff(query?: StaffListQuery): Promise<StaffListResponse> {
  const res = await bffClient.get<StaffListResponse>('/staff', { params: query });
  return res.data;
}

// Server-side variant for the team page load. limit=100 is the backend cap — tab
// counts are computed client-side from this single page (fine for MVP team sizes).
export async function fetchStaffList(token: string): Promise<StaffListResponse> {
  const res = await bffServerFetch(token, '/staff?limit=100&offset=0', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch staff list (${res.status})`);
  return res.json() as Promise<StaffListResponse>;
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
