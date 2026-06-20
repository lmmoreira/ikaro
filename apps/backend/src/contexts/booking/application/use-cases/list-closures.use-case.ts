import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';
import { CloseScheduleUseCaseResult } from './close-schedule.use-case';
import { ListClosuresDto } from '../dtos/close-schedule.dto';

export interface ListClosuresUseCaseResult {
  items: CloseScheduleUseCaseResult[];
}

@Injectable()
export class ListClosuresUseCase {
  constructor(
    @Inject(SCHEDULE_CLOSURE_REPOSITORY)
    private readonly closureRepo: IScheduleClosureRepository,
    private readonly tenantContext: RequestContext,
  ) {}

  async execute(dto: ListClosuresDto): Promise<ListClosuresUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const closures = await this.closureRepo.findByTenantAndDateRange(tenantId, dto.from, dto.to);

    return {
      items: closures.map((c) => ({
        id: c.id,
        date: c.date,
        startTime: c.startTime?.value ?? null,
        endTime: c.endTime?.value ?? null,
        reason: c.reason,
        notes: c.notes,
        createdBy: c.createdBy,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}
