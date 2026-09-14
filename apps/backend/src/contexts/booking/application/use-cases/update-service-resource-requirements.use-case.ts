import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { ResourceRequirementProps } from '../../domain/resource-requirement';
import { toResourceRequirement } from '../dtos/resource-requirement.dto';
import { UpdateServiceResourceRequirementsDto } from '../dtos/update-service-resource-requirements.dto';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { resolveActiveResourceTypes } from './active-resource-types.util';

export type UpdateServiceResourceRequirementsUseCaseInput = UpdateServiceResourceRequirementsDto & {
  id: string;
  tenantId: string;
};

export interface UpdateServiceResourceRequirementsUseCaseResult {
  id: string;
  resourceRequirements: ResourceRequirementProps[];
}

@Injectable()
export class UpdateServiceResourceRequirementsUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: UpdateServiceResourceRequirementsUseCaseInput,
  ): Promise<UpdateServiceResourceRequirementsUseCaseResult> {
    const { id, tenantId } = input;
    const service = await this.serviceRepo.findById(id, tenantId);
    if (!service) throw new ServiceNotFoundError(id);

    const requirements = input.resourceRequirements.map(toResourceRequirement);
    const activeResourceTypes = await resolveActiveResourceTypes(
      this.resourceRepo,
      tenantId,
      requirements.map((r) => r.type),
    );

    service.setResourceRequirements(requirements, activeResourceTypes);

    await this.txManager.run(async () => {
      await this.serviceRepo.save(service);
    });

    await this.bookingPlatform.revalidatePublicPages(tenantId);

    return {
      id: service.id,
      resourceRequirements: service.resourceRequirements.map((r) => r.toJSON()),
    };
  }
}
