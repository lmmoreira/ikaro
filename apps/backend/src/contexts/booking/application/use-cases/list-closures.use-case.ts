import { Inject, Injectable } from '@nestjs/common';
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';
import { ListClosuresDto } from '../dtos/close-schedule.dto';
import { ScheduleClosureListItem } from '../dtos/schedule-list-item.dto';

export type ListClosuresUseCaseInput = ListClosuresDto & {
  tenantId: string;
};

export interface ListClosuresUseCaseResult {
  items: ScheduleClosureListItem[];
}

@Injectable()
export class ListClosuresUseCase {
  constructor(
    @Inject(SCHEDULE_CLOSURE_REPOSITORY)
    private readonly closureRepo: IScheduleClosureRepository,
  ) {}

  async execute(input: ListClosuresUseCaseInput): Promise<ListClosuresUseCaseResult> {
    const { tenantId } = input;
    const closures = await this.closureRepo.findByTenantAndDateRange(
      tenantId,
      input.from,
      input.to,
      input.resourceId,
    );

    return {
      items: closures.map((c) => ({
        id: c.id,
        resourceId: c.resourceId,
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
