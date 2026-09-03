import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import type { BusinessHours, DayHours } from '../../../../shared/value-objects/business-hours.vo';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import { Resource } from '../../domain/resource.aggregate';
import {
  DayAlreadyOpenInSettingsError,
  OpeningDateInPastError,
  OpeningExceedsTenantWindowError,
  ScheduleOpeningAlreadyExistsError,
  TenantOpeningRequiredError,
} from '../../domain/errors/booking-domain.error';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IBookingPlatformPort, BOOKING_PLATFORM_PORT } from '../ports/booking-platform.port';
import {
  getUtcWeekDayName,
  todayUTC,
  type WeekDayName,
} from '../../../../shared/utils/calendar-date';
import { OpenScheduleDto } from '../dtos/open-schedule.dto';

export type OpenScheduleUseCaseInput = OpenScheduleDto & {
  tenantId: string;
  createdBy: string;
  businessHours: BusinessHours;
};

export interface OpenScheduleUseCaseResult {
  id: string;
  resourceId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

@Injectable()
export class OpenScheduleUseCase {
  constructor(
    @Inject(SCHEDULE_OPENING_REPOSITORY)
    private readonly openingRepo: IScheduleOpeningRepository,
    @Inject(RESOURCE_REPOSITORY)
    private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_PLATFORM_PORT)
    private readonly platform: IBookingPlatformPort,
    @Inject(TENANT_LOCK_PORT)
    private readonly tenantLock: ITenantLockPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: OpenScheduleUseCaseInput): Promise<OpenScheduleUseCaseResult> {
    const { tenantId, createdBy, resourceId } = input;

    const today = todayUTC();
    if (input.date < today) throw new OpeningDateInPastError();

    const resource =
      resourceId != null ? await this.resourceRepo.findById(resourceId, tenantId) : null;
    if (resourceId != null && !resource) throw new ResourceNotFoundError(resourceId);

    const weekday = getUtcWeekDayName(input.date);
    // Fast, non-authoritative pre-check against the request's businessHours snapshot — fails
    // fast for the common case without ever acquiring the settings lock. The authoritative
    // check runs again below, inside the transaction, against a freshly-read value (Codex PR
    // #460 round-4/5 TOCTOU finding — a concurrent PATCH /tenants/settings could otherwise
    // leave this snapshot stale between the read and the write).
    if (this.effectiveDayHours(resource, input.businessHours, weekday) !== null) {
      throw new DayAlreadyOpenInSettingsError(input.date);
    }

    const existing = await this.openingRepo.findByTenantAndDate(tenantId, input.date, resourceId);
    if (existing) throw new ScheduleOpeningAlreadyExistsError(input.date);

    const opening = ScheduleOpening.open({
      tenantId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      createdBy,
      resourceId,
      notes: input.notes,
    });

    await this.txManager.run(async () => {
      await this.validateUnderLock(input, resource, weekday);
      await this.openingRepo.save(opening);
    });

    return this.toResult(opening);
  }

  private async validateUnderLock(
    input: OpenScheduleUseCaseInput,
    resource: Resource | null,
    weekday: WeekDayName,
  ): Promise<void> {
    const { tenantId, resourceId } = input;

    // Row-locks the tenant (bypassing the read cache entirely) and serializes against a
    // concurrent UpdateTenantSettingsUseCase write, so the check below can't observe a
    // businessHours value that's about to be superseded (Codex PR #460 round-4/5/7 finding — an
    // earlier advisory-lock design here still went through the cache regardless of lock
    // ordering, so it didn't actually close this race; findByIdForUpdate's real Postgres row
    // lock does).
    const { businessHours } = await this.platform.getBusinessHoursAndLocaleForUpdate(tenantId);

    if (this.effectiveDayHours(resource, businessHours, weekday) !== null) {
      throw new DayAlreadyOpenInSettingsError(input.date);
    }

    if (resourceId != null) {
      // Acquire the per-(tenant, date) advisory lock before re-checking the tenant-window
      // bound, so a concurrent deletion of the prerequisite tenant-wide opening
      // (RemoveScheduleOpeningUseCase, which takes the same lock) can't interleave between
      // this check and the write below (Codex PR #460 round-4 finding).
      await this.tenantLock.lockTenantDay(tenantId, input.date);
      await this.assertWithinTenantWindow(input, businessHours, weekday);
    }
  }

  // A resource with its own workingHours gates the "day closed" check against its own
  // schedule, not the tenant's — a resource with workingHours: null inherits the tenant's
  // businessHours instead (Resource's own documented inheritance rule, docs/02-DOMAIN_MODEL.md
  // § Resource). Tenant-wide openings (resource === null) always use businessHours.
  private effectiveDayHours(
    resource: Resource | null,
    businessHours: BusinessHours,
    weekday: WeekDayName,
  ): DayHours {
    return resource?.workingHours != null ? resource.workingHours[weekday] : businessHours[weekday];
  }

  // A resource-scoped opening's window must always fit inside something the tenant itself has
  // open for that date (docs/13-DATABASE_SCHEMA.md § schedule_openings Rules: "never... extends
  // beyond a tenant opening/window"). What that "something" is depends on whether the day is
  // normally open for the tenant:
  //  - Normally open (businessHours[day] set): that window IS the bound — no explicit
  //    tenant-wide opening row is needed, since the day is inherently open already. This is
  //    what makes the round-1 scenario possible at all (a resource closed on a day the tenant
  //    itself is open, e.g. one stylist's day off): execute()'s day-closed check already
  //    required the *resource* to be closed for an opening to be attempted here, and
  //    Resource.create()'s own subset-of-tenant-hours validation guarantees a resource can
  //    never be open on a day the tenant is closed — so this branch and the one below never
  //    actually conflict with each other.
  //  - Normally closed (businessHours[day] is null): the tenant has no hours at all that date,
  //    so an explicit tenant-wide opening must already exist to bound against — the
  //    manager/staff must open the tenant level first for that date before opening a specific
  //    resource within it.
  private async assertWithinTenantWindow(
    input: OpenScheduleUseCaseInput,
    businessHours: BusinessHours,
    weekday: WeekDayName,
  ): Promise<void> {
    const tenantDayHours = businessHours[weekday];
    let boundStart: string;
    let boundEnd: string;
    if (tenantDayHours !== null) {
      boundStart = tenantDayHours.open;
      boundEnd = tenantDayHours.close;
    } else {
      const tenantWideOpening = await this.openingRepo.findByTenantAndDate(
        input.tenantId,
        input.date,
      );
      if (!tenantWideOpening) throw new TenantOpeningRequiredError(input.date);
      boundStart = tenantWideOpening.startTime.value;
      boundEnd = tenantWideOpening.endTime.value;
    }
    if (input.startTime < boundStart || input.endTime > boundEnd) {
      throw new OpeningExceedsTenantWindowError(input.date);
    }
  }

  private toResult(opening: ScheduleOpening): OpenScheduleUseCaseResult {
    return {
      id: opening.id,
      resourceId: opening.resourceId,
      date: opening.date,
      startTime: opening.startTime.value,
      endTime: opening.endTime.value,
      notes: opening.notes,
      createdBy: opening.createdBy,
      createdAt: opening.createdAt.toISOString(),
    };
  }
}
