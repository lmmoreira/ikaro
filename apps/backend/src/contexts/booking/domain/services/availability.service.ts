import {
  BookingSettings,
  BusinessHours,
  DayHours,
} from '../../../../contexts/platform/domain/value-objects/tenant-settings.vo';
import {
  getUtcWeekDayName,
  localDateTimeToUTCIso,
  utcDateToLocalHHMM,
} from '../../../../shared/utils/calendar-date';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { BookedSlot } from '../booked-slot';
import { ScheduleClosure } from '../schedule-closure.aggregate';
import { ScheduleOpening } from '../schedule-opening.aggregate';

export interface ServiceDuration {
  durationMinutes: number;
}

export interface AvailabilityInput {
  date: string; // YYYY-MM-DD in tenant timezone
  services: ServiceDuration[];
  businessHours: BusinessHours;
  slotGranularityMinutes: BookingSettings['slot_granularity_minutes'];
  serviceBufferMinutes: number;
  closures: ScheduleClosure[];
  opening: ScheduleOpening | null;
  existingBookings: BookedSlot[];
}

export interface AvailableSlot {
  startsAt: string; // ISO-8601 UTC
  endsAt: string; // ISO-8601 UTC
}

export class AvailabilityService {
  calculate(input: AvailabilityInput): AvailableSlot[] {
    const {
      date,
      services,
      businessHours,
      slotGranularityMinutes,
      serviceBufferMinutes,
      closures,
      opening,
      existingBookings,
    } = input;

    const effectiveHours = this.resolveEffectiveHours(date, businessHours, closures, opening);
    if (!effectiveHours) return [];

    const { open, close, partialClosures } = effectiveHours;
    const timezone = businessHours.timezone;

    const totalMins =
      services.reduce((sum, s) => sum + s.durationMinutes, 0) + serviceBufferMinutes;

    const bookedRanges = existingBookings.map((b) => {
      const startHHMM = utcDateToLocalHHMM(b.scheduledAt, timezone);
      return {
        start: startHHMM,
        end: TimeOfDay.create(startHHMM).addMinutes(b.totalDurationMins).value,
      };
    });

    const slots: AvailableSlot[] = [];
    let cursor = TimeOfDay.create(open);
    const closeTime = TimeOfDay.create(close);

    while (cursor.addMinutes(totalMins).toMinutes() <= closeTime.toMinutes()) {
      const endTime = cursor.addMinutes(totalMins);

      const blockedByClosure = partialClosures.some((c) =>
        this.overlaps(cursor.value, endTime.value, c.startTime!.value, c.endTime!.value),
      );

      const blockedByBooking = bookedRanges.some((b) =>
        this.overlaps(cursor.value, endTime.value, b.start, b.end),
      );

      if (!blockedByClosure && !blockedByBooking) {
        slots.push({
          startsAt: localDateTimeToUTCIso(date, cursor.value, timezone),
          endsAt: localDateTimeToUTCIso(date, endTime.value, timezone),
        });
      }

      cursor = cursor.addMinutes(slotGranularityMinutes);
    }

    return slots;
  }

  private resolveEffectiveHours(
    date: string,
    businessHours: BusinessHours,
    closures: ScheduleClosure[],
    opening: ScheduleOpening | null,
  ): { open: string; close: string; partialClosures: ScheduleClosure[] } | null {
    if (opening) {
      return { open: opening.startTime.value, close: opening.endTime.value, partialClosures: [] };
    }

    const dayHours: DayHours = businessHours[getUtcWeekDayName(date)];

    if (!dayHours) return null;

    if (closures.some((c) => c.isFullDay())) return null;

    return {
      open: dayHours.open,
      close: dayHours.close,
      partialClosures: closures.filter((c) => !c.isFullDay()),
    };
  }

  /** Two HH:MM half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap when aStart < bEnd && bStart < aEnd. */
  private overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return aStart < bEnd && bStart < aEnd;
  }
}
