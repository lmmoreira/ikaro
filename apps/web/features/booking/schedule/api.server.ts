import 'server-only';
import type { ScheduleClosureListResponse, ScheduleOpeningListResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

function buildRangeQuery(from: string, to: string): string {
  return new URLSearchParams({ from, to }).toString();
}

async function fetchScheduleResponse<T>(token: string, path: string): Promise<T> {
  const res = await bffServerFetch(token, path);
  if (!res.ok) throw new Error(`Failed to fetch ${path} (${res.status})`);
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
