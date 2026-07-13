import 'server-only';
import type { StaffListResponse, StaffResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { parseErrorBody } from '@/shared/lib/api/errors';

// Server-side variant for the team page load. limit=100 is the backend cap — tab
// counts are computed client-side from this single page (fine for MVP team sizes).
export async function fetchStaffList(token: string): Promise<StaffListResponse> {
  const res = await bffServerFetch(token, '/staff?limit=100&offset=0', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch staff list (${res.status})`);
  return res.json() as Promise<StaffListResponse>;
}

export class StaffDetailFetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    public readonly field?: string,
    detail?: string,
  ) {
    super(detail ?? `Failed to fetch staff detail (${status})`);
    this.name = 'StaffDetailFetchError';
    Object.setPrototypeOf(this, new.target.prototype);
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
