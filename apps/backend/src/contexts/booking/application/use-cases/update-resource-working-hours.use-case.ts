import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { ResourceType, ResourceWorkingHours } from '../../domain/resource.types';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { UpdateResourceWorkingHoursDto } from '../dtos/resource.dto';

export type UpdateResourceWorkingHoursUseCaseInput = UpdateResourceWorkingHoursDto & {
  id: string;
  tenantId: string;
  tenantBusinessHours: BusinessHours;
};

export interface UpdateResourceWorkingHoursUseCaseResult {
  id: string;
  type: ResourceType;
  workingHours: ResourceWorkingHours | null;
  updatedAt: string;
}

@Injectable()
export class UpdateResourceWorkingHoursUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: UpdateResourceWorkingHoursUseCaseInput,
  ): Promise<UpdateResourceWorkingHoursUseCaseResult> {
    const resource = await this.resourceRepo.findById(input.id, input.tenantId);
    if (!resource) throw new ResourceNotFoundError(input.id);

    resource.updateWorkingHours(input.workingHours, input.tenantBusinessHours);

    await this.txManager.run(async () => {
      await this.resourceRepo.save(resource);
    });

    return {
      id: resource.id,
      type: resource.type,
      workingHours: resource.workingHours,
      updatedAt: resource.updatedAt.toISOString(),
    };
  }
}
