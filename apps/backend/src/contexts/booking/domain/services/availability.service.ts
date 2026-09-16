import { BusinessHours, DayHours } from '../../../../shared/value-objects/business-hours.vo';
import {
  getUtcWeekDayName,
  localDateTimeToUTCIso,
  utcDateToLocalHHMM,
} from '../../../../shared/utils/calendar-date';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { ResourceOccupiedSlot } from '../resource-occupied-slot';
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
  // OpenScheduleUseCase's identical creation-time precedence.
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
  // Occupancy for the ONE resource this call is scoped to (docs/13-DATABASE_SCHEMA.md §
  // booking.resource_occupancy) — a bundle/pool service calls this once per candidate resource
  // and combines the results via intersect()/union() below; a flat degenerate service calls it
  // once for the tenant's LOCATION resource.
  existingOccupancy: ResourceOccupiedSlot[];
}

export interface AvailableSlot {
  startsAt: string; // ISO-8601 UTC
  endsAt: string; // ISO-8601 UTC
}

export interface LegSpanInput {
  legIndex: number;
  durationMinutes: number;
  transitionGapAfterMinutes: number;
}

export interface LegSpan {
  legIndex: number;
  startsAt: Date;
  // Includes this leg's own resource turnover (UC-059) — the actual window that leg's resource
  // is occupied for, distinct from when the customer physically leaves (startsAt + durationMinutes).
  endsAtWithTurnover: Date;
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
      existingOccupancy,
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
    const bookedRanges = this.buildBookedRanges(existingOccupancy, timezone);

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
    existingOccupancy: ResourceOccupiedSlot[],
    timezone: string,
  ): { start: string; end: string }[] {
    // endsAt already includes the effective buffer/turnover (UC-059) — no extra arithmetic here,
    // unlike the old BookedSlot shape which derived an end from scheduledAt + totalDurationMins.
    return existingOccupancy.map((o) => ({
      start: utcDateToLocalHHMM(o.startsAt, timezone),
      end: utcDateToLocalHHMM(o.endsAt, timezone),
    }));
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

  // Resource-aware precedence. The tenant window is a hard outer boundary, resolved first,
  // exactly as this method behaved pre-M21 — a resource opening can never bypass a tenant-wide
  // closure or extend beyond the tenant's own window (docs/02-DOMAIN_MODEL.md § Tenant boundary
  // and resource schedule resolution). `resource` undefined/null reduces to exactly the
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

  // UC-058 step 2 — a bundle (>1 resourceRequirement, or >1 leg-resource simultaneously) is
  // available only when EVERY required resource is simultaneously free. Each element of
  // `perResourceSlots` is one candidate resource's own calculate() result; a slot survives only
  // if it appears (by identical startsAt/endsAt) in every one of them.
  intersect(perResourceSlots: AvailableSlot[][]): AvailableSlot[] {
    if (perResourceSlots.length === 0) return [];
    const [first, ...rest] = perResourceSlots;
    return first.filter((slot) =>
      rest.every((slots) =>
        slots.some((s) => s.startsAt === slot.startsAt && s.endsAt === slot.endsAt),
      ),
    );
  }

  // UC-058 step 3 — an AUTO_FUNGIBLE_POOL requirement is available whenever ANY pool member is
  // free. Dedupes by startsAt/endsAt across every candidate's own calculate() result.
  union(perResourceSlots: AvailableSlot[][]): AvailableSlot[] {
    const seen = new Map<string, AvailableSlot>();
    for (const slots of perResourceSlots) {
      for (const slot of slots) {
        seen.set(`${slot.startsAt}|${slot.endsAt}`, slot);
      }
    }
    return [...seen.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  // UC-059 step 1 — the effective gap before the next booking on a resource, for a flat
  // (non-legged) service, is whichever is larger: the service's own cleanup buffer, or the
  // resource's own turnover. A1: both 0 collapses to today's exact single-number buffer model.
  effectiveFlatGapMinutes(bufferAfterMinutes: number, turnoverMinutes: number): number {
    return Math.max(bufferAfterMinutes, turnoverMinutes);
  }

  // UC-059 step 2 — for a legged service, each leg's own resource turnover applies at that leg's
  // own resource; transitionGapAfterMinutes is independent and additive to the appointment's
  // total span (it determines when the NEXT leg starts, regardless of this leg's own turnover).
  // Legs are sorted by legIndex defensively — same discipline as computeLegsTotalSpanMinutes()
  // (service-leg-span.ts), since setLegs() only rejects duplicate indexes, not out-of-order ones.
  computeLegSpans(
    candidateStart: Date,
    legs: LegSpanInput[],
    turnoverMinutesByLegIndex: ReadonlyMap<number, number>,
  ): LegSpan[] {
    const ordered = [...legs].sort((a, b) => a.legIndex - b.legIndex);
    const spans: LegSpan[] = [];
    let cursor = candidateStart;
    for (const leg of ordered) {
      const legEnd = new Date(cursor.getTime() + leg.durationMinutes * 60_000);
      const turnover = turnoverMinutesByLegIndex.get(leg.legIndex) ?? 0;
      spans.push({
        legIndex: leg.legIndex,
        startsAt: cursor,
        endsAtWithTurnover: new Date(legEnd.getTime() + turnover * 60_000),
      });
      cursor = new Date(legEnd.getTime() + leg.transitionGapAfterMinutes * 60_000);
    }
    return spans;
  }
}
