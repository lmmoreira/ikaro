import { Inject, Injectable } from '@nestjs/common';
import { ResourceType, ResourceWorkingHours } from '../../domain/resource.types';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';

export interface GetResourceByIdUseCaseInput {
  id: string;
  tenantId: string;
}

export interface GetResourceByIdUseCaseResult {
  id: string;
  type: ResourceType;
  refId: string | null;
  name: string;
  workingHours: ResourceWorkingHours | null;
  turnoverMinutes: number;
  maxCapacity: number | null;
  isActive: boolean;
}

@Injectable()
export class GetResourceByIdUseCase {
  constructor(@Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository) {}

  async execute(input: GetResourceByIdUseCaseInput): Promise<GetResourceByIdUseCaseResult> {
    const resource = await this.resourceRepo.findById(input.id, input.tenantId);
    if (!resource) throw new ResourceNotFoundError(input.id);

    return {
      id: resource.id,
      type: resource.type,
      refId: resource.refId,
      name: resource.name,
      workingHours: resource.workingHours,
      turnoverMinutes: resource.turnoverMinutes,
      maxCapacity: resource.maxCapacity,
      isActive: resource.isActive,
    };
  }
}
