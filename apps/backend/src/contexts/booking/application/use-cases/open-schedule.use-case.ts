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

    if (businessHours[getUtcWeekDayName(input.date)] !== null) {
      throw new DayAlreadyOpenInSettingsError(input.date);
    }

    if (resourceId != null) {
      const resource = await this.resourceRepo.findById(resourceId, tenantId);
      if (!resource) throw new ResourceNotFoundError(resourceId);
    }

    const existing = await this.openingRepo.findByTenantAndDate(tenantId, input.date, resourceId);
    if (existing) throw new ScheduleOpeningAlreadyExistsError(input.date);

    const opening = ScheduleOpening.open(
      tenantId,
      input.date,
      input.startTime,
      input.endTime,
      createdBy,
      resourceId,
      input.notes,
    );

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
