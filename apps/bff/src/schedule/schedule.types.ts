export interface ScheduleClosureResponse {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  reason: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ScheduleClosureListResponse {
  items: ScheduleClosureResponse[];
}

export interface ScheduleOpeningResponse {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ScheduleOpeningListResponse {
  items: ScheduleOpeningResponse[];
}
