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

  // Resource-aware precedence (Codex PR #460 round-9 finding). The tenant window is a hard
  // outer boundary, resolved first, exactly as this method behaved pre-M21 — a resource opening
  // can never bypass a tenant-wide closure or extend beyond the tenant's own window
  // (docs/02-DOMAIN_MODEL.md § Tenant boundary and resource schedule resolution). The previous
  // version let ANY applicable opening — tenant or resource-scoped — short-circuit past every
  // closure check unconditionally, which broke that invariant for the new resource-scoped
  // combinations this method exists to handle. `resource` undefined/null reduces to exactly the
  // pre-M21 single-scope computation (`resolveScopeWindow` applied once, tenant-wide) — both
  // existing tenant-wide "opening wins over closure" tests are unchanged by this refactor.
  private resolveEffectiveHours(
    date: string,
    businessHours: BusinessHours,
    resource: Resource | null | undefined,
    closures: ScheduleClosure[],
    tenantOpening: ScheduleOpening | null,
    resourceOpening: ScheduleOpening | null | undefined,
  ): { open: string; close: string; partialClosures: ScheduleClosure[] } | null {
    const weekday = getUtcWeekDayName(date);
    const tenantClosures = closures.filter((c) => c.resourceId === null);

    const tenantWindow = this.resolveScopeWindow(
      businessHours[weekday],
      tenantClosures,
      tenantOpening,
    );
    if (!tenantWindow) return null;
    if (!resource) return tenantWindow;

    // A resource with its own workingHours gates against its own schedule, never the tenant's
    // (Resource's own documented inheritance rule, docs/02-DOMAIN_MODEL.md § Resource) — mirrors
    // OpenScheduleUseCase's identical effectiveDayHours computation. An inheriting resource's
    // baseline is the tenant's own already-resolved window, so a tenant-wide opening on an
    // otherwise-closed day is inherited automatically — no separate `?? tenantOpening` fallback
    // is needed here the way the pre-fix version required.
    const resourceClosures = closures.filter((c) => c.resourceId === resource.id);
    const usesOwnHours = resource.workingHours != null;
    const resourceDayHours: DayHours = usesOwnHours
      ? resource.workingHours![weekday]
      : { open: tenantWindow.open, close: tenantWindow.close };

    const resourceWindow = this.resolveScopeWindow(
      resourceDayHours,
      resourceClosures,
      resourceOpening ?? null,
    );
    if (!resourceWindow) return null;

    // A resource-scoped window can never extend beyond the tenant's own window (same invariant).
    const open = resourceWindow.open > tenantWindow.open ? resourceWindow.open : tenantWindow.open;
    const close =
      resourceWindow.close < tenantWindow.close ? resourceWindow.close : tenantWindow.close;
    if (open >= close) return null;

    return {
      open,
      close,
      partialClosures: [...tenantWindow.partialClosures, ...resourceWindow.partialClosures],
    };
  }

  // Single-scope resolution: opening beats a same-scope closure unconditionally (the "highest
  // priority" layer of the Three-Layer Schedule Resolution), else a full-day closure blocks the
  // whole day, else the day's hours apply with partial closures filtered out. Applied once for
  // the tenant scope and, when a resource is given, once more for the resource scope — never
  // mixing an opening/closure from one scope into the other's check.
  private resolveScopeWindow(
    dayHours: DayHours,
    scopedClosures: ScheduleClosure[],
    scopedOpening: ScheduleOpening | null,
  ): { open: string; close: string; partialClosures: ScheduleClosure[] } | null {
    if (scopedOpening) {
      return {
        open: scopedOpening.startTime.value,
        close: scopedOpening.endTime.value,
        partialClosures: [],
      };
    }

    if (!dayHours) return null;
    if (scopedClosures.some((c) => c.isFullDay())) return null;

    return {
      open: dayHours.open,
      close: dayHours.close,
      partialClosures: scopedClosures.filter((c) => !c.isFullDay()),
    };
  }

  /** Two HH:MM half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap when aStart < bEnd && bStart < aEnd. */
  private overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return aStart < bEnd && bStart < aEnd;
  }
}
