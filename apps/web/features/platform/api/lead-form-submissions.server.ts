import 'server-only';
import type {
  LeadFormSubmissionDetailResponse,
  LeadFormSubmissionsListResponse,
} from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { assertOk, FetchError } from '@/shared/lib/api/errors';

export interface ListLeadFormSubmissionsParams {
  readonly page?: number;
  readonly pageSize?: number;
}

// Server-side, uncached — admin submissions list (UC-041 main flow steps 1-2), STAFF|MANAGER.
// search/filters/submittedFrom/submittedTo (M20-S12/S13) are out of this story's scope.
export async function listLeadFormSubmissions(
  token: string,
  params?: ListLeadFormSubmissionsParams,
): Promise<LeadFormSubmissionsListResponse> {
  const query = new URLSearchParams();
  if (params?.page !== undefined) query.set('page', String(params.page));
  if (params?.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
  const querySuffix = query.toString() ? `?${query.toString()}` : '';
  const res = await bffServerFetch(token, `/tenants/lead-form/submissions${querySuffix}`);
  if (!res.ok) throw new Error(`Failed to fetch lead form submissions (${res.status})`);
  return res.json() as Promise<LeadFormSubmissionsListResponse>;
}

export class LeadFormSubmissionFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Failed to fetch lead form submission (${status})`, status, code, field, detail);
    this.name = 'LeadFormSubmissionFetchError';
  }
}

// Server-side, uncached — admin submission detail (UC-041 main flow step 6), STAFF|MANAGER.
export async function getLeadFormSubmission(
  token: string,
  id: string,
): Promise<LeadFormSubmissionDetailResponse> {
  const res = await bffServerFetch(token, `/tenants/lead-form/submissions/${id}`);
  await assertOk(res, LeadFormSubmissionFetchError);
  return res.json() as Promise<LeadFormSubmissionDetailResponse>;
}
