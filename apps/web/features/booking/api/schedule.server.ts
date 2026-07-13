import 'server-only';
import type { ScheduleClosureListResponse, ScheduleOpeningListResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { assertOk, FetchError } from '@/shared/lib/api/errors';

function buildRangeQuery(from: string, to: string): string {
  return new URLSearchParams({ from, to }).toString();
}

export class ScheduleFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Schedule request failed (${status})`, status, code, field, detail);
    this.name = 'ScheduleFetchError';
  }
}

async function fetchScheduleResponse<T>(token: string, path: string): Promise<T> {
  const res = await bffServerFetch(token, path);
  await assertOk(res, ScheduleFetchError);
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
