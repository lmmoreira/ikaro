import { Inject, Injectable } from '@nestjs/common';
import { ResourceType, ResourceWorkingHours } from '../../domain/resource.types';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { ListResourcesDto } from '../dtos/resource.dto';

export type ListResourcesUseCaseInput = ListResourcesDto & {
  tenantId: string;
};

export interface ResourceListItem {
  id: string;
  type: ResourceType;
  refId: string | null;
  name: string;
  workingHours: ResourceWorkingHours | null;
  turnoverMinutes: number;
  maxCapacity: number | null;
  isActive: boolean;
}

export interface ListResourcesUseCaseResult {
  items: ResourceListItem[];
}

@Injectable()
export class ListResourcesUseCase {
  constructor(@Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository) {}

  async execute(input: ListResourcesUseCaseInput): Promise<ListResourcesUseCaseResult> {
    const resources = await this.resourceRepo.findByTenant(input.tenantId, {
      type: input.type,
      isActive: input.isActive,
    });

    return {
      items: resources.map((r) => ({
        id: r.id,
        type: r.type,
        refId: r.refId,
        name: r.name,
        workingHours: r.workingHours,
        turnoverMinutes: r.turnoverMinutes,
        maxCapacity: r.maxCapacity,
        isActive: r.isActive,
      })),
    };
  }
}
