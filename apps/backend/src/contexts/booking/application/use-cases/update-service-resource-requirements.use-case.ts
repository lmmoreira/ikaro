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
import { resolveActiveResourceIdsByType } from './active-resource-types.util';

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
    const requirements = input.resourceRequirements.map(toResourceRequirement);

    const service = await this.txManager.run(async () => {
      // findByIdForUpdate (not findById) — closes the lost-update race between two concurrent
      // Service configuration writes (see update-service.use-case.ts's identical comment).
      const current = await this.serviceRepo.findByIdForUpdate(id, tenantId);
      if (!current) throw new ServiceNotFoundError(id);

      // Read inside the transaction, immediately before the write it guards — narrows the
      // window where a concurrent resource deactivation could commit between this validation
      // and the save below to a single DB round-trip, the same accepted race shape already
      // tolerated elsewhere in this codebase (docs/ENGINEERING_RULES_BACKEND.md's count-then-insert
      // precedent), rather than the far wider window a pre-transaction read left open.
      const activeResourceIdsByType = await resolveActiveResourceIdsByType(
        this.resourceRepo,
        tenantId,
        requirements.map((r) => r.type),
      );
      current.setResourceRequirements(requirements, activeResourceIdsByType);
      await this.serviceRepo.save(current);
      return current;
    });

    await this.bookingPlatform.revalidatePublicPages(tenantId);

    return {
      id: service.id,
      resourceRequirements: service.resourceRequirements.map((r) => r.toJSON()),
    };
  }
}
