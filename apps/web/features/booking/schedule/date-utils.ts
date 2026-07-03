import type { TenantBusinessHours, TenantDayHours } from '@ikaro/types';
import { addDays, toDateKey } from '@/shared/utils/date-utils';

export type WeekDayKey = keyof Omit<TenantBusinessHours, 'timezone'>;

const WEEKDAY_KEYS: readonly WeekDayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function getWeekStartKey(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const offset = (date.getUTCDay() + 6) % 7;
  return toDateKey(addDays(date, -offset));
}

export function getWeekEndKey(dateKey: string): string {
  return toDateKey(addDays(parseDateKey(dateKey), 6));
}

export function getWeekDates(weekStartKey: string): string[] {
  const weekStart = parseDateKey(weekStartKey);
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(weekStart, index)));
}

export function getWeekdayKey(dateKey: string): WeekDayKey {
  const day = parseDateKey(dateKey).getUTCDay();
  return WEEKDAY_KEYS[day === 0 ? 6 : day - 1];
}

export function getDayHoursForDate(
  dateKey: string,
  businessHours: TenantBusinessHours,
): TenantDayHours | null {
  return businessHours[getWeekdayKey(dateKey)];
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function getLocalTimeKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
