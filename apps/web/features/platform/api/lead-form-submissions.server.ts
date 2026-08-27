import 'server-only';
import type {
  LeadFormFilterOptionsResponse,
  LeadFormSubmissionDetailResponse,
  LeadFormSubmissionsListResponse,
} from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { assertOk, FetchError } from '@/shared/lib/api/errors';
import type { LeadFormSearchFilterEntry } from '@/features/platform/model/lead-form-search';

export interface ListLeadFormSubmissionsParams {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly filters?: readonly LeadFormSearchFilterEntry[];
  readonly submittedFrom?: string;
  readonly submittedTo?: string;
}

// Server-side, uncached — admin submissions list (UC-041 main flow steps 1-2), STAFF|MANAGER.
// search/filters are mutually exclusive (enforced by the BFF/backend, not re-checked here) —
// a caller passing both is the caller's bug, not this function's to guard against.
export async function listLeadFormSubmissions(
  token: string,
  params?: ListLeadFormSubmissionsParams,
): Promise<LeadFormSubmissionsListResponse> {
  const query = new URLSearchParams();
  if (params?.page !== undefined) query.set('page', String(params.page));
  if (params?.pageSize !== undefined) query.set('pageSize', String(params.pageSize));
  if (params?.search) query.set('search', params.search);
  if (params?.filters && params.filters.length > 0) {
    query.set('filters', JSON.stringify(params.filters));
  }
  if (params?.submittedFrom) query.set('submittedFrom', params.submittedFrom);
  if (params?.submittedTo) query.set('submittedTo', params.submittedTo);
  const querySuffix = query.toString() ? `?${query.toString()}` : '';
  const res = await bffServerFetch(token, `/tenants/lead-form/submissions${querySuffix}`);
  if (!res.ok) throw new Error(`Failed to fetch lead form submissions (${res.status})`);
  return res.json() as Promise<LeadFormSubmissionsListResponse>;
}

// Server-side, uncached — powers the advanced-filter "pergunta" dropdown (UC-041 step 4, A4).
export async function getLeadFormFilterOptions(
  token: string,
): Promise<LeadFormFilterOptionsResponse> {
  const res = await bffServerFetch(token, '/tenants/lead-form/submissions/filter-options');
  if (!res.ok) throw new Error(`Failed to fetch lead form filter options (${res.status})`);
  return res.json() as Promise<LeadFormFilterOptionsResponse>;
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
