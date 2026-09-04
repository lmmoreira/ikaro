export interface ScheduleListItem {
  id: string;
  resourceId: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ScheduleClosureListItem extends ScheduleListItem {
  reason: string;
}
