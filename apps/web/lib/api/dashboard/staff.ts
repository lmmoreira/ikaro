import { bffClient } from '../bff-client';

export type StaffRole = 'MANAGER' | 'STAFF';

export interface StaffResponse {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: StaffRole;
  readonly isActive: boolean;
  readonly createdAt: string;
}

export interface StaffListResponse {
  readonly items: readonly StaffResponse[];
  readonly pagination: {
    readonly limit: number;
    readonly offset: number;
    readonly total: number;
    readonly hasMore: boolean;
    readonly nextOffset: number | null;
  };
}

export interface InviteStaffRequest {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: StaffRole;
}

export interface InviteStaffResponse {
  readonly staffId: string;
  readonly email: string;
  readonly role: StaffRole;
  readonly isActive: false;
}

export interface DeactivateStaffResponse {
  readonly staffId: string;
  readonly isActive: false;
}

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
