import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import {
  DayAlreadyOpenInSettingsError,
  OpeningDateInPastError,
  ScheduleOpeningAlreadyExistsError,
} from '../../domain/errors/booking-domain.error';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';
import {
  IScheduleTenantSettingsPort,
  SCHEDULE_TENANT_SETTINGS_PORT,
} from '../ports/schedule-tenant-settings.port';
import { getUtcWeekDayName } from '../../../../shared/utils/calendar-date';
import { OpenScheduleDto } from '../dtos/open-schedule.dto';

export interface OpenScheduleUseCaseResult {
  id: string;
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
    @Inject(SCHEDULE_TENANT_SETTINGS_PORT)
    private readonly tenantSettings: IScheduleTenantSettingsPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(dto: OpenScheduleDto): Promise<OpenScheduleUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const createdBy = this.tenantContext.actorId ?? '';

    const today = new Date().toISOString().slice(0, 10);
    if (dto.date < today) throw new OpeningDateInPastError();

    const businessHours = await this.tenantSettings.getBusinessHours(tenantId);
    if (businessHours[getUtcWeekDayName(dto.date)] !== null) {
      throw new DayAlreadyOpenInSettingsError(dto.date);
    }

    const existing = await this.openingRepo.findByTenantAndDate(tenantId, dto.date);
    if (existing) throw new ScheduleOpeningAlreadyExistsError(dto.date);

    const opening = ScheduleOpening.open(
      tenantId,
      dto.date,
      dto.startTime,
      dto.endTime,
      createdBy,
      dto.notes,
    );

    await this.txManager.run(async () => {
      await this.openingRepo.save(opening);
    });

    return this.toResult(opening);
  }

  private toResult(opening: ScheduleOpening): OpenScheduleUseCaseResult {
    return {
      id: opening.id,
      date: opening.date,
      startTime: opening.startTime.value,
      endTime: opening.endTime.value,
      notes: opening.notes,
      createdBy: opening.createdBy,
      createdAt: opening.createdAt.toISOString(),
    };
  }
}
