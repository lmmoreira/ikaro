import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import {
  DayAlreadyOpenInSettingsError,
  OpeningDateInPastError,
  OpeningExceedsTenantWindowError,
  ScheduleOpeningAlreadyExistsError,
} from '../../domain/errors/booking-domain.error';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { getUtcWeekDayName, todayUTC } from '../../../../shared/utils/calendar-date';
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
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: OpenScheduleUseCaseInput): Promise<OpenScheduleUseCaseResult> {
    const { tenantId, createdBy, businessHours, resourceId } = input;

    const today = todayUTC();
    if (input.date < today) throw new OpeningDateInPastError();

    const resource =
      resourceId != null ? await this.resourceRepo.findById(resourceId, tenantId) : null;
    if (resourceId != null && !resource) throw new ResourceNotFoundError(resourceId);

    // A resource with its own workingHours gates the "day closed" check against its own
    // schedule, not the tenant's — a resource with workingHours: null inherits the tenant's
    // businessHours instead (Resource's own documented inheritance rule, docs/02-DOMAIN_MODEL.md
    // § Resource). Tenant-wide openings (resource === null) always use businessHours.
    const weekday = getUtcWeekDayName(input.date);
    const effectiveDayHours =
      resource?.workingHours != null ? resource.workingHours[weekday] : businessHours[weekday];
    if (effectiveDayHours !== null) {
      throw new DayAlreadyOpenInSettingsError(input.date);
    }

    const existing = await this.openingRepo.findByTenantAndDate(tenantId, input.date, resourceId);
    if (existing) throw new ScheduleOpeningAlreadyExistsError(input.date);

    // A resource-scoped opening may never extend beyond a tenant-wide opening that already
    // covers the same date (docs/13-DATABASE_SCHEMA.md § schedule_openings Rules: "never...
    // extends beyond a tenant opening/window"). When no tenant-wide opening exists for this
    // date, there is nothing to bound against — the resource's own window stands on its own,
    // which is the primary way a resource-scoped opening extends availability beyond the
    // tenant's default hours in the first place.
    if (resourceId != null) {
      const tenantWideOpening = await this.openingRepo.findByTenantAndDate(tenantId, input.date);
      if (
        tenantWideOpening &&
        (input.startTime < tenantWideOpening.startTime.value ||
          input.endTime > tenantWideOpening.endTime.value)
      ) {
        throw new OpeningExceedsTenantWindowError(input.date);
      }
    }

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
      await this.openingRepo.save(opening);
    });

    return this.toResult(opening);
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
