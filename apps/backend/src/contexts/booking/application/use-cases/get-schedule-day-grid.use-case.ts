import { Inject, Injectable } from '@nestjs/common';
import { ResourceType } from '../../domain/resource.types';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import {
  IBookingAvailabilityPort,
  BOOKING_AVAILABILITY_PORT,
} from '../ports/booking-availability.port';
import { GetScheduleDayGridDto } from '../dtos/get-schedule-day-grid.dto';

export type GetScheduleDayGridUseCaseInput = GetScheduleDayGridDto & {
  tenantId: string;
  timezone: string;
};

export interface DayGridBlock {
  startsAt: string;
  endsAt: string;
  kind: 'BOOKING' | 'CLASS_SESSION';
  refId: string;
}

export interface DayGridColumn {
  resourceId: string;
  name: string;
  type: ResourceType;
  blocks: DayGridBlock[];
}

export interface GetScheduleDayGridUseCaseResult {
  date: string;
  columns: DayGridColumn[];
}

@Injectable()
export class GetScheduleDayGridUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_AVAILABILITY_PORT)
    private readonly bookingPort: IBookingAvailabilityPort,
  ) {}

  async execute(input: GetScheduleDayGridUseCaseInput): Promise<GetScheduleDayGridUseCaseResult> {
    const { tenantId, date, timezone } = input;

    const resources = await this.resourceRepo.findByTenant(tenantId, { isActive: true });
    const resourceIds = resources.map((r) => r.id);
    const occupancy = await this.bookingPort.findDayGridOccupancy(
      tenantId,
      resourceIds,
      date,
      timezone,
    );

    const blocksByResource = new Map<string, DayGridBlock[]>();
    for (const block of occupancy) {
      const blocks = blocksByResource.get(block.resourceId) ?? [];
      blocks.push({
        startsAt: block.startsAt.toISOString(),
        endsAt: block.endsAt.toISOString(),
        kind: block.kind,
        refId: block.refId,
      });
      blocksByResource.set(block.resourceId, blocks);
    }

    return {
      date,
      columns: resources.map((r) => ({
        resourceId: r.id,
        name: r.name,
        type: r.type,
        blocks: blocksByResource.get(r.id) ?? [],
      })),
    };
  }
}
