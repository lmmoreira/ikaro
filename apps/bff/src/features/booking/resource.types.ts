export type ResourceType = 'LOCATION' | 'STAFF' | 'ROOM' | 'EQUIPMENT';

export interface DayHours {
  open: string;
  close: string;
}

export interface ResourceWorkingHours {
  monday: DayHours | null;
  tuesday: DayHours | null;
  wednesday: DayHours | null;
  thursday: DayHours | null;
  friday: DayHours | null;
  saturday: DayHours | null;
  sunday: DayHours | null;
}

export interface ResourceResponse {
  id: string;
  type: ResourceType;
  refId: string | null;
  name: string;
  workingHours: ResourceWorkingHours | null;
  turnoverMinutes: number;
  maxCapacity: number | null;
  isActive: boolean;
}

export interface ResourceListResponse {
  items: ResourceResponse[];
}
