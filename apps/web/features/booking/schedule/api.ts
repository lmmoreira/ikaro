import type {
  CreateClosureRequest,
  CreateOpeningRequest,
  ScheduleClosure,
  ScheduleClosureListResponse,
  ScheduleOpening,
  ScheduleOpeningListResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

export type {
  CreateClosureRequest,
  CreateOpeningRequest,
  ScheduleClosure,
  ScheduleClosureListResponse,
  ScheduleOpening,
  ScheduleOpeningListResponse,
};

function buildRangeQuery(from: string, to: string): string {
  return new URLSearchParams({ from, to }).toString();
}

async function fetchScheduleResponse<T>(token: string, path: string): Promise<T> {
  const res = await bffServerFetch(token, path);
  if (!res.ok) throw new Error(`Failed to fetch ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

export async function listClosures(from: string, to: string): Promise<ScheduleClosureListResponse> {
  const res = await bffClient.get<ScheduleClosureListResponse>('/schedule/closures', {
    params: { from, to },
  });
  return res.data;
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

export async function createClosure(body: CreateClosureRequest): Promise<ScheduleClosure> {
  const res = await bffClient.post<ScheduleClosure>('/schedule/closures', body);
  return res.data;
}

export async function removeClosure(id: string): Promise<void> {
  await bffClient.delete(`/schedule/closures/${id}`);
}

export async function listOpenings(from: string, to: string): Promise<ScheduleOpeningListResponse> {
  const res = await bffClient.get<ScheduleOpeningListResponse>('/schedule/openings', {
    params: { from, to },
  });
  return res.data;
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

export async function createOpening(body: CreateOpeningRequest): Promise<ScheduleOpening> {
  const res = await bffClient.post<ScheduleOpening>('/schedule/openings', body);
  return res.data;
}

export async function removeOpening(id: string): Promise<void> {
  await bffClient.delete(`/schedule/openings/${id}`);
}
