import { BusinessHours, DayHours } from '../../../../shared/value-objects/business-hours.vo';
import {
  getUtcWeekDayName,
  localDateTimeToUTCIso,
  utcDateToLocalHHMM,
} from '../../../../shared/utils/calendar-date';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { BookedSlot } from '../booked-slot';
import { Resource } from '../resource.aggregate';
import { ScheduleClosure } from '../schedule-closure.aggregate';
import { ScheduleOpening } from '../schedule-opening.aggregate';

export interface ServiceDuration {
  durationMinutes: number;
}

export interface AvailabilityInput {
  date: string; // YYYY-MM-DD in tenant timezone
  services: ServiceDuration[];
  businessHours: BusinessHours;
  // Optional/undefined = tenant-wide (today's exact unchanged behavior). When set, the
  // resource's own workingHours gates the day-closed check instead of businessHours, mirroring
  // OpenScheduleUseCase's identical creation-time precedence (Codex PR #460 round-8 finding:
  // resource-scoped closures/openings were persisted and listable but invisible to this
  // calculator, since callers never passed a resourceId through in the first place).
  resource?: Resource | null;
  slotGranularityMinutes: 15 | 30 | 60;
  serviceBufferMinutes: number;
  // Tenant-wide AND resource-scoped closures for `date`, combined by the caller — both always
  // apply regardless of which one bounds the window below.
  closures: ScheduleClosure[];
  // The tenant-wide opening for `date`, if any (`resourceId IS NULL`).
  opening: ScheduleOpening | null;
  // The resource-scoped opening for `date`, if any. Optional/undefined = none (tenant-wide call).
  resourceOpening?: ScheduleOpening | null;
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
      resource,
      slotGranularityMinutes,
      serviceBufferMinutes,
      closures,
      opening,
      resourceOpening,
      existingBookings,
    } = input;

    const effectiveHours = this.resolveEffectiveHours(
      date,
      businessHours,
      resource,
      closures,
      opening,
      resourceOpening,
    );
    if (!effectiveHours) return [];

    const { open, close, partialClosures } = effectiveHours;
    const timezone = businessHours.timezone;
    const totalMins =
      services.reduce((sum, s) => sum + s.durationMinutes, 0) + serviceBufferMinutes;
    const bookedRanges = this.buildBookedRanges(existingBookings, timezone);

    return this.generateSlots({
      date,
      timezone,
      open,
      close,
      totalMins,
      slotGranularityMinutes,
      partialClosures,
      bookedRanges,
    });
  }

  private buildBookedRanges(
    existingBookings: BookedSlot[],
    timezone: string,
  ): { start: string; end: string }[] {
    return existingBookings.map((b) => {
      const startHHMM = utcDateToLocalHHMM(b.scheduledAt, timezone);
      return {
        start: startHHMM,
        end: TimeOfDay.create(startHHMM).addMinutes(b.totalDurationMins).value,
      };
    });
  }

  private generateSlots(ctx: {
    date: string;
    timezone: string;
    open: string;
    close: string;
    totalMins: number;
    slotGranularityMinutes: number;
    partialClosures: ScheduleClosure[];
    bookedRanges: { start: string; end: string }[];
  }): AvailableSlot[] {
    const slots: AvailableSlot[] = [];
    let cursor = TimeOfDay.create(ctx.open);
    const closeTime = TimeOfDay.create(ctx.close);

    while (cursor.addMinutes(ctx.totalMins).toMinutes() <= closeTime.toMinutes()) {
      const endTime = cursor.addMinutes(ctx.totalMins);

      const blockedByClosure = ctx.partialClosures.some((c) =>
        this.overlaps(cursor.value, endTime.value, c.startTime!.value, c.endTime!.value),
      );
      const blockedByBooking = ctx.bookedRanges.some((b) =>
        this.overlaps(cursor.value, endTime.value, b.start, b.end),
      );

      if (!blockedByClosure && !blockedByBooking) {
        slots.push({
          startsAt: localDateTimeToUTCIso(ctx.date, cursor.value, ctx.timezone),
          endsAt: localDateTimeToUTCIso(ctx.date, endTime.value, ctx.timezone),
        });
      }

      cursor = cursor.addMinutes(ctx.slotGranularityMinutes);
    }

    return slots;
  }

  // Resource-aware precedence (Codex PR #460 round-8 finding). `resource` undefined/null and
  // `resourceOpening` undefined/null (a tenant-wide call) reduces to this method's exact
  // pre-M21 behavior: the tenant-wide opening always wins when present, unconditionally, before
  // businessHours is even consulted.
  private resolveEffectiveHours(
    date: string,
    businessHours: BusinessHours,
    resource: Resource | null | undefined,
    closures: ScheduleClosure[],
    tenantOpening: ScheduleOpening | null,
    resourceOpening: ScheduleOpening | null | undefined,
  ): { open: string; close: string; partialClosures: ScheduleClosure[] } | null {
    const weekday = getUtcWeekDayName(date);
    // A resource with its own workingHours gates the day-closed check against its own schedule,
    // not the tenant's (Resource's own documented inheritance rule, docs/02-DOMAIN_MODEL.md §
    // Resource) — mirrors OpenScheduleUseCase's identical effectiveDayHours computation.
    const usesOwnHours = resource?.workingHours != null;
    const effectiveDayHours: DayHours = usesOwnHours
      ? resource!.workingHours![weekday]
      : businessHours[weekday];

    // A resource using its own hours can never have a *tenant-wide* opening apply to it —
    // write-time validation never lets that combination arise (OpenScheduleUseCase only bounds
    // a resource-scoped opening against a tenant-wide one when the resource itself inherits
    // tenant hours); its own resource-scoped opening is the only possible override. A
    // tenant-inheriting or tenant-wide call still prefers a resource-scoped opening when one
    // happens to be present, falling back to the tenant-wide opening otherwise.
    const applicableOpening = usesOwnHours
      ? (resourceOpening ?? null)
      : (resourceOpening ?? tenantOpening);
    if (applicableOpening) {
      return {
        open: applicableOpening.startTime.value,
        close: applicableOpening.endTime.value,
        partialClosures: [],
      };
    }

    if (!effectiveDayHours) return null;

    if (closures.some((c) => c.isFullDay())) return null;

    return {
      open: effectiveDayHours.open,
      close: effectiveDayHours.close,
      partialClosures: closures.filter((c) => !c.isFullDay()),
    };
  }

  /** Two HH:MM half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap when aStart < bEnd && bStart < aEnd. */
  private overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return aStart < bEnd && bStart < aEnd;
  }
}
