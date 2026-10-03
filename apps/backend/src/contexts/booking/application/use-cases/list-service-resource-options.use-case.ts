import { Inject, Injectable } from '@nestjs/common';
import { ServiceNotFoundError } from '../../domain/errors/booking-service.error';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { filterByResourcePool } from './resource-pool.helpers';

export type ListServiceResourceOptionsUseCaseInput = {
  id: string;
  tenantId: string;
};

export interface ServiceResourceOptionsRequirementResult {
  serviceId: string;
  legIndex: number | null;
  resourceType: ResourceType;
  selectionMode: 'CUSTOMER_CHOICE';
  requiredQuantity: number;
  options: { resourceId: string; name: string }[];
}

export interface ListServiceResourceOptionsUseCaseResult {
  requirements: ServiceResourceOptionsRequirementResult[];
}

interface RequirementSource {
  legIndex: number | null;
  requirement: ResourceRequirement;
}

@Injectable()
export class ListServiceResourceOptionsUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
  ) {}

  async execute(
    input: ListServiceResourceOptionsUseCaseInput,
  ): Promise<ListServiceResourceOptionsUseCaseResult> {
    const service = await this.serviceRepo.findById(input.id, input.tenantId);
    if (!service?.isActive) throw new ServiceNotFoundError(input.id);

    const sources: RequirementSource[] = service.legs
      ? service.legs.flatMap((leg) =>
          leg.resourceRequirements.map((requirement) => ({ legIndex: leg.legIndex, requirement })),
        )
      : service.resourceRequirements.map((requirement) => ({ legIndex: null, requirement }));

    const choiceSources = sources.filter(
      ({ requirement }) => requirement.selectionMode === 'CUSTOMER_CHOICE',
    );
    const types = [...new Set(choiceSources.map(({ requirement }) => requirement.type))];
    const loaded = await Promise.all(
      types.map((type) => this.resourceRepo.findByTenant(input.tenantId, { type, isActive: true })),
    );
    const activeByType = new Map<ResourceType, Resource[]>(
      types.map((type, index) => [type, loaded[index]]),
    );

    const requirements: ServiceResourceOptionsRequirementResult[] = [];
    for (const { legIndex, requirement } of choiceSources) {
      const active = activeByType.get(requirement.type)!;
      requirements.push({
        serviceId: service.id,
        legIndex,
        resourceType: requirement.type,
        selectionMode: 'CUSTOMER_CHOICE',
        requiredQuantity: requirement.requiredQuantity,
        options: filterByResourcePool(active, requirement.resourcePoolIds)
          .map((resource) => ({ resourceId: resource.id, name: resource.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
    return { requirements };
  }
}
