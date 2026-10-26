import { utcDateToLocalDate, utcDateToLocalHHMM } from '../../../../shared/utils/calendar-date';
import type { ScheduleClosure } from '../schedule-closure.aggregate';

export type WindowHoursVerdict = 'FREE' | 'CLOSED' | 'OUTSIDE_HOURS';

export interface DayHoursWindow {
  open: string;
  close: string;
  partialClosures: ScheduleClosure[];
}

/** Two HH:MM half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap when aStart < bEnd && bStart < aEnd. */
export function hhmmOverlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// A window judged against one local day's resolved hours. Hours are wall-clock times within a
// single day, so a window that runs into the next local day is outside them even though its end's
// HH:MM ("02:00") compares below the closing time.
export function windowVerdictWithinDay(
  hours: DayHoursWindow,
  window: { start: Date; end: Date },
  timezone: string,
  date: string,
): WindowHoursVerdict {
  const startHHMM = utcDateToLocalHHMM(window.start, timezone);
  const endHHMM = utcDateToLocalHHMM(window.end, timezone);
  const endsNextDay = utcDateToLocalDate(window.end, timezone) !== date;
  if (endsNextDay || startHHMM < hours.open || endHHMM > hours.close) return 'OUTSIDE_HOURS';
  const hitsPartialClosure = hours.partialClosures.some((c) =>
    hhmmOverlaps(startHHMM, endHHMM, c.startTime!.value, c.endTime!.value),
  );
  return hitsPartialClosure ? 'CLOSED' : 'FREE';
}
