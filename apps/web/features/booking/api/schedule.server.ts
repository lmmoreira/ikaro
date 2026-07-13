import 'server-only';
import type { ScheduleClosureListResponse, ScheduleOpeningListResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { parseErrorBody } from '@/shared/lib/api/errors';

function buildRangeQuery(from: string, to: string): string {
  return new URLSearchParams({ from, to }).toString();
}

export class ScheduleFetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string,
    public readonly field?: string,
    detail?: string,
  ) {
    super(detail ?? `Schedule request failed (${status})`);
    this.name = 'ScheduleFetchError';
    Object.setPrototypeOf(this, new.target.prototype);
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
