import { Inject, Injectable } from '@nestjs/common';
import {
  IScheduleOpeningRepository,
  SCHEDULE_OPENING_REPOSITORY,
} from '../ports/schedule-opening-repository.port';
import { ListOpeningsDto } from '../dtos/open-schedule.dto';

export type ListOpeningsInput = ListOpeningsDto & {
  tenantId: string;
};

export interface ListOpeningsUseCaseResult {
  items: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    notes: string | null;
    createdBy: string;
    createdAt: string;
  }>;
}

@Injectable()
export class ListOpeningsUseCase {
  constructor(
    @Inject(SCHEDULE_OPENING_REPOSITORY)
    private readonly openingRepo: IScheduleOpeningRepository,
  ) {}

  async execute(input: ListOpeningsInput): Promise<ListOpeningsUseCaseResult> {
    const { tenantId } = input;
    const openings = await this.openingRepo.findByTenantAndDateRange(
      tenantId,
      input.from,
      input.to,
    );

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
