import 'server-only';
import type { ScheduleClosureListResponse, ScheduleOpeningListResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { FetchError, parseErrorBody } from '@/shared/lib/api/errors';

function buildRangeQuery(from: string, to: string): string {
  return new URLSearchParams({ from, to }).toString();
}

export class ScheduleFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(status, code, field, detail ?? `Schedule request failed (${status})`);
    this.name = 'ScheduleFetchError';
  }
}

async function fetchScheduleResponse<T>(token: string, path: string): Promise<T> {
  const res = await bffServerFetch(token, path);
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new ScheduleFetchError(res.status, body.code, body.field, body.detail);
  }
  return res.json() as Promise<T>;
}

export async function fetchScheduleClosures(
  token: string,
  from: string,
  to: string,
): Promise<ScheduleClosureListResponse> {
  return fetchScheduleResponse<ScheduleClosureListResponse>(
    token,
    `/schedule/closures?${buildRangeQuery(from, to)}`,
  );
}

export async function fetchScheduleOpenings(
  token: string,
  from: string,
  to: string,
): Promise<ScheduleOpeningListResponse> {
  return fetchScheduleResponse<ScheduleOpeningListResponse>(
    token,
    `/schedule/openings?${buildRangeQuery(from, to)}`,
  );
}
