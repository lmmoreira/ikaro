import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  addDaysUTC,
  utcDateString,
  utcDateToLocalDate,
} from '../../../../shared/utils/calendar-date';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import { findFirstMatchingSlot } from '../../domain/availability-alert-matching.helpers';
import { AvailabilityAlertMatchingWindow } from '../../domain/availability-alert.types';
import { BookingDomainError } from '../../domain/errors/booking-domain-error.base';
import {
  AvailabilityDateInPastError,
  BookingConcurrentModificationError,
} from '../../domain/errors/booking-domain.error';
import {
  AVAILABILITY_ALERT_REPOSITORY,
  IAvailabilityAlertRepository,
} from '../ports/availability-alert-repository.port';
import {
  AvailabilityAlertTenantContext,
  BOOKING_PLATFORM_PORT,
  IBookingPlatformPort,
} from '../ports/booking-platform.port';
import { GetAvailabilityUseCase } from './get-availability.use-case';

export interface MatchAvailabilityAlertsUseCaseInput {
  tenantId: string;
  correlationId: string;
  // The services to re-check. null = every service of the tenant that has an ACTIVE alert (the
  // daily sweep).
  serviceIds: string[] | null;
  // An instant whose tenant-local calendar day is re-evaluated (a booking just freed that day).
  // null = the whole customer-selectable window (the daily sweep).
  around: Date | null;
  now?: Date;
}

export interface MatchAvailabilityAlertsUseCaseResult {
  notified: number;
}

type AlertGroup = { preferredResourceId: string | null; durationMinutes: number | null };

interface AlertGroupEntry {
  group: AlertGroup;
  alerts: AvailabilityAlert[];
}

// Availability depends only on the preferred resource and the chosen duration, so alerts that share
// both share one read per day — never one availability query per alert.
function groupAlerts(alerts: AvailabilityAlert[]): Map<string, AlertGroupEntry> {
  const groups = new Map<string, AlertGroupEntry>();
  for (const alert of alerts) {
    const group = {
      preferredResourceId: alert.preferredResourceId,
      durationMinutes: alert.durationMinutes,
    };
    const key = `${group.preferredResourceId ?? ''}|${group.durationMinutes ?? ''}`;
    const entry = groups.get(key) ?? { group, alerts: [] };
    entry.alerts.push(alert);
    groups.set(key, entry);
  }
  return groups;
}

// The tenant's availability inputs plus the dates to evaluate this run.
interface MatchScope {
  context: AvailabilityAlertTenantContext;
  dates: string[];
}

// UC-072 step 3 (M23-S07). Matches ACTIVE availability alerts against what is *really bookable*:
// it asks the availability engine (GetAvailabilityUseCase — hours, closures, openings, occupancy and
// resource rules) for the affected service/day(s) and records one notification for every alert
// whose acceptable window contains a bookable slot. Two triggers feed it with the same logic — the
// capacity-release handlers (cancel/reject/reschedule, one day) and the daily sweep (the whole
// window) — so a slot is found the same way however it opened.
//
// Only dates a customer can actually select are considered (`selectableDays`, resolved from the
// tenant's booking window and hotsite date picker): an alert is never notified about a date the
// booking page would not let the customer pick.
//
// One notification per alert: recordNotificationAttempt() moves ACTIVE → NOTIFIED, so an alert is
// never matched again; a racing handler/sweep loses on the aggregate's version check
// (BookingConcurrentModificationError) and the match is skipped, never doubled.
@Injectable()
export class MatchAvailabilityAlertsUseCase {
  private readonly logger = new AppLogger(MatchAvailabilityAlertsUseCase.name);

  constructor(
    @Inject(AVAILABILITY_ALERT_REPOSITORY)
    private readonly alertRepo: IAvailabilityAlertRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly platformPort: IBookingPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly getAvailability: GetAvailabilityUseCase,
  ) {}

  async execute(
    input: MatchAvailabilityAlertsUseCaseInput,
  ): Promise<MatchAvailabilityAlertsUseCaseResult> {
    const { tenantId, correlationId } = input;
    const now = input.now ?? new Date();

    const serviceIds =
      input.serviceIds ?? (await this.alertRepo.findServiceIdsWithActiveAlerts(tenantId, now));

    // The tenant context (a tenant + hotsite read) is only needed once an alert exists, and almost
    // every cancelled booking's service has none — so it is resolved lazily, once per run, and a
    // service with no ACTIVE alert costs a single indexed query.
    let scope: Promise<MatchScope> | null = null;
    const getScope = (): Promise<MatchScope> => (scope ??= this.resolveScope(input, now));

    const perService = await mapSequentially([...new Set(serviceIds)], (serviceId) =>
      this.matchService({ tenantId, correlationId, serviceId, getScope, now }),
    );
    return { notified: perService.reduce((sum, count) => sum + count, 0) };
  }

  private async resolveScope(
    input: MatchAvailabilityAlertsUseCaseInput,
    now: Date,
  ): Promise<MatchScope> {
    const context = await this.platformPort.getAvailabilityAlertContext(input.tenantId);
    return { context, dates: this.datesToCheck(input.around, context, now) };
  }

  // The calendar days to evaluate, clamped to [today, today + selectableDays − 1] where "today" is
  // the UTC date — the contract of the availability read itself (it rejects a date before
  // todayUTC()) and of the public calendar, so the two never disagree about what is selectable. A
  // freed booking contributes the tenant-local day it was on, which is the day its slot is listed
  // under; if that day is already behind the window it is simply not selectable any more.
  private datesToCheck(
    around: Date | null,
    context: AvailabilityAlertTenantContext,
    now: Date,
  ): string[] {
    const today = utcDateString(now);
    const lastDate = addDaysUTC(today, context.selectableDays - 1);

    if (around) {
      const date = utcDateToLocalDate(around, context.businessHours.timezone);
      return date >= today && date <= lastDate ? [date] : [];
    }
    const dates: string[] = [];
    for (let date = today; date <= lastDate; date = addDaysUTC(date, 1)) dates.push(date);
    return dates;
  }

  private async matchService(args: {
    tenantId: string;
    correlationId: string;
    serviceId: string;
    getScope: () => Promise<MatchScope>;
    now: Date;
  }): Promise<number> {
    const { tenantId, correlationId, serviceId, getScope, now } = args;
    const alerts = await this.alertRepo.findActiveByService(tenantId, serviceId, now);
    if (alerts.length === 0) return 0;
    const { context, dates } = await getScope();
    if (dates.length === 0) return 0;

    const perGroup = await mapSequentially([...groupAlerts(alerts).values()], (entry) =>
      this.matchGroup({ tenantId, correlationId, serviceId, entry, dates, context, now }),
    );
    return perGroup.reduce((sum, count) => sum + count, 0);
  }

  private async matchGroup(args: {
    tenantId: string;
    correlationId: string;
    serviceId: string;
    entry: AlertGroupEntry;
    dates: string[];
    context: AvailabilityAlertTenantContext;
    now: Date;
  }): Promise<number> {
    const { tenantId, correlationId, serviceId, entry, dates, context, now } = args;
    const slots = await this.collectSlots({
      tenantId,
      serviceId,
      group: entry.group,
      dates,
      context,
      now,
    });
    if (slots.length === 0) return 0;

    const notified = await mapSequentially(entry.alerts, async (alert) => {
      const slot = findFirstMatchingSlot(alert.criteria, alert.timezone, slots);
      return slot ? this.notify(alert, slot, correlationId, now) : false;
    });
    return notified.filter(Boolean).length;
  }

  // The bookable slots of one service (optionally for one preferred resource / at one duration)
  // across the dates, keeping only those that start after `now`. A domain error from the availability
  // read is "nothing bookable here", never a failure of the whole run: a day already past in UTC just
  // skips that day, while any other (the service or resource was deactivated, the duration is no
  // longer valid) is not date-specific, so it ends this group's read after one warning instead of one
  // per remaining date.
  private async collectSlots(args: {
    tenantId: string;
    serviceId: string;
    group: AlertGroup;
    dates: string[];
    context: AvailabilityAlertTenantContext;
    now: Date;
  }): Promise<AvailabilityAlertMatchingWindow[]> {
    const read = { stopped: false };
    const perDate = await mapSequentially(args.dates, (date) => this.readDay(args, date, read));
    return perDate.flat();
  }

  private async readDay(
    args: {
      tenantId: string;
      serviceId: string;
      group: AlertGroup;
      context: AvailabilityAlertTenantContext;
      now: Date;
    },
    date: string,
    read: { stopped: boolean },
  ): Promise<AvailabilityAlertMatchingWindow[]> {
    if (read.stopped) return [];
    try {
      return await this.bookableSlots(args, date);
    } catch (err) {
      if (!(err instanceof BookingDomainError)) throw err;
      if (err instanceof AvailabilityDateInPastError) return [];
      read.stopped = true;
      this.logger.warn(`Availability unavailable for alert matching (${err.code})`, {
        tenantId: args.tenantId,
        serviceId: args.serviceId,
        resourceId: args.group.preferredResourceId,
      });
      return [];
    }
  }

  // What can really be booked that day. The service-level read applies every requirement of the
  // service (bundle, legs, pools). An alert's preferred resource is then only a further filter on
  // it — the slot must also be free for that resource — never a replacement for it: the
  // explicit-resource read ignores the service's other requirements, so used alone it would offer a
  // slot whose other required resource is occupied.
  private async bookableSlots(
    args: {
      tenantId: string;
      serviceId: string;
      group: AlertGroup;
      context: AvailabilityAlertTenantContext;
      now: Date;
    },
    date: string,
  ): Promise<AvailabilityAlertMatchingWindow[]> {
    const { tenantId, serviceId, group, context, now } = args;
    const request = {
      tenantId,
      date,
      serviceIds: [serviceId],
      ...(group.durationMinutes ? { durationMinutes: group.durationMinutes } : {}),
      businessHours: context.businessHours,
      slotGranularityMinutes: context.slotGranularityMinutes,
      serviceBufferMinutes: context.serviceBufferMinutes,
    };
    const { slots } = await this.getAvailability.execute(request);
    let bookable = slots;
    if (group.preferredResourceId && slots.length > 0) {
      const onResource = await this.getAvailability.execute({
        ...request,
        resourceId: group.preferredResourceId,
      });
      const freeStarts = new Set(onResource.slots.map((slot) => slot.startsAt));
      bookable = slots.filter((slot) => freeStarts.has(slot.startsAt));
    }
    // The read still lists the earlier slots of today: one that has already started is not
    // something a customer can book, so it never satisfies an alert.
    return bookable
      .map((slot) => ({ startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt) }))
      .filter((slot) => slot.startsAt > now);
  }

  // Own transaction per alert, so one alert changing never blocks another. A version conflict
  // means another trigger (or the customer's own cancel) got there first — an outcome we accept.
  private async notify(
    alert: AvailabilityAlert,
    slot: AvailabilityAlertMatchingWindow,
    correlationId: string,
    now: Date,
  ): Promise<boolean> {
    try {
      return await this.txManager.run(async () => {
        if (!alert.recordNotificationAttempt(slot, 'EMAIL', correlationId, now)) return false;
        await this.alertRepo.save(alert);
        return true;
      });
    } catch (err) {
      if (err instanceof BookingConcurrentModificationError) return false;
      throw err;
    }
  }
}
