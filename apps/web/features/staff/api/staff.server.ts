import 'server-only';
import type { StaffListResponse, StaffResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { FetchError, parseErrorBody } from '@/shared/lib/api/errors';

// Server-side variant for the team page load. limit=100 is the backend cap — tab
// counts are computed client-side from this single page (fine for MVP team sizes).
export async function fetchStaffList(token: string): Promise<StaffListResponse> {
  const res = await bffServerFetch(token, '/staff?limit=100&offset=0', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch staff list (${res.status})`);
  return res.json() as Promise<StaffListResponse>;
}

export class StaffDetailFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(status, code, field, detail ?? `Failed to fetch staff detail (${status})`);
    this.name = 'StaffDetailFetchError';
  }
}

// Server-side variant for the team detail page load.
export async function fetchStaffMember(token: string, id: string): Promise<StaffResponse> {
  const res = await bffServerFetch(token, `/staff/${id}`, { cache: 'no-store' });
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new StaffDetailFetchError(res.status, body.code, body.field, body.detail);
  }
  return res.json() as Promise<StaffResponse>;
}
