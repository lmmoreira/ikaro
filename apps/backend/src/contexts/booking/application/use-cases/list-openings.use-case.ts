import { Inject, Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';
import { OpenScheduleUseCaseResult } from './open-schedule.use-case';
import { ListOpeningsDto } from '../dtos/open-schedule.dto';

export interface ListOpeningsUseCaseResult {
  items: OpenScheduleUseCaseResult[];
}

@Injectable()
export class ListOpeningsUseCase {
  constructor(
    @Inject(SCHEDULE_OPENING_REPOSITORY)
    private readonly openingRepo: IScheduleOpeningRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(dto: ListOpeningsDto): Promise<ListOpeningsUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const openings = await this.openingRepo.findByTenantAndDateRange(tenantId, dto.from, dto.to);

    return {
      items: openings.map((o) => ({
        id: o.id,
        date: o.date,
        startTime: o.startTime.value,
        endTime: o.endTime.value,
        notes: o.notes,
        createdBy: o.createdBy,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }
}
