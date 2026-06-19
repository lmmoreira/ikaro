import { bffClient } from '../bff-client';

export type ClosureReason = 'STAFF_DAY_OFF' | 'MAINTENANCE' | 'HOLIDAY';

export interface ScheduleClosureResponse {
  readonly id: string;
  readonly date: string;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly reason: ClosureReason;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ScheduleClosureListResponse {
  readonly items: readonly ScheduleClosureResponse[];
}

export interface CreateClosureRequest {
  readonly date: string;
  readonly reason: ClosureReason;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly notes?: string;
}

export interface ScheduleOpeningResponse {
  readonly id: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ScheduleOpeningListResponse {
  readonly items: readonly ScheduleOpeningResponse[];
}

export interface CreateOpeningRequest {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly notes?: string;
}

export async function listClosures(from: string, to: string): Promise<ScheduleClosureListResponse> {
  const res = await bffClient.get<ScheduleClosureListResponse>('/schedule/closures', {
    params: { from, to },
  });
  return res.data;
}

export async function createClosure(body: CreateClosureRequest): Promise<ScheduleClosureResponse> {
  const res = await bffClient.post<ScheduleClosureResponse>('/schedule/closures', body);
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

export async function createOpening(body: CreateOpeningRequest): Promise<ScheduleOpeningResponse> {
  const res = await bffClient.post<ScheduleOpeningResponse>('/schedule/openings', body);
  return res.data;
}

export async function removeOpening(id: string): Promise<void> {
  await bffClient.delete(`/schedule/openings/${id}`);
}
