import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { ServiceLegReconstituteProps } from '../../domain/service-leg';
import { toServiceLeg } from '../dtos/resource-requirement.dto';
import { UpdateServiceLegsDto } from '../dtos/update-service-legs.dto';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { resolveActiveResourceIdsByType } from './active-resource-types.util';

export type UpdateServiceLegsUseCaseInput = UpdateServiceLegsDto & {
  id: string;
  tenantId: string;
};

export interface UpdateServiceLegsUseCaseResult {
  id: string;
  legs: ServiceLegReconstituteProps[];
  totalSpanMinutes: number;
}

@Injectable()
export class UpdateServiceLegsUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: UpdateServiceLegsUseCaseInput): Promise<UpdateServiceLegsUseCaseResult> {
    const { id, tenantId } = input;
    const legs = input.legs.map(toServiceLeg);
    const allRequirementTypes = legs.flatMap((leg) => leg.resourceRequirements.map((r) => r.type));
    const activeResourceIdsByType = await resolveActiveResourceIdsByType(
      this.resourceRepo,
      tenantId,
      allRequirementTypes,
    );

    const { service, totalSpanMinutes } = await this.txManager.run(async () => {
      // findByIdForUpdate (not findById) — closes the lost-update race between two concurrent
      // Service configuration writes (see update-service.use-case.ts's identical comment).
      const current = await this.serviceRepo.findByIdForUpdate(id, tenantId);
      if (!current) throw new ServiceNotFoundError(id);

      const span = current.setLegs(legs, activeResourceIdsByType);
      await this.serviceRepo.save(current);
      return { service: current, totalSpanMinutes: span };
    });

    await this.bookingPlatform.revalidatePublicPages(tenantId);

    return {
      id: service.id,
      legs: (service.legs ?? []).map((leg) => leg.toJSON()),
      totalSpanMinutes,
    };
  }
}
