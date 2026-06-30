import { Inject, Injectable } from '@nestjs/common';
import {
  IScheduleClosureRepository,
  SCHEDULE_CLOSURE_REPOSITORY,
} from '../ports/schedule-closure-repository.port';
import { CloseScheduleUseCaseResult } from './close-schedule.use-case';
import { ListClosuresDto } from '../dtos/close-schedule.dto';

export type ListClosuresInput = ListClosuresDto & {
  tenantId: string;
};

export interface ListClosuresUseCaseResult {
  items: CloseScheduleUseCaseResult[];
}

@Injectable()
export class ListClosuresUseCase {
  constructor(
    @Inject(SCHEDULE_CLOSURE_REPOSITORY)
    private readonly closureRepo: IScheduleClosureRepository,
  ) {}

  async execute(input: ListClosuresInput): Promise<ListClosuresUseCaseResult> {
    const { tenantId } = input;
    const closures = await this.closureRepo.findByTenantAndDateRange(
      tenantId,
      input.from,
      input.to,
    );

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
