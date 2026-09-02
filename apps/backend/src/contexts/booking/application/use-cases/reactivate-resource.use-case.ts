import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  ResourceNotFoundError,
  ResourceStaffNotFoundError,
} from '../../domain/errors/resource.error';
import { ResourceType } from '../../domain/resource.types';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { BOOKING_STAFF_PORT, IBookingStaffPort } from '../ports/booking-staff.port';

export interface ReactivateResourceUseCaseInput {
  id: string;
  tenantId: string;
}

export interface ReactivateResourceUseCaseResult {
  id: string;
  isActive: true;
}

@Injectable()
export class ReactivateResourceUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_STAFF_PORT) private readonly staffPort: IBookingStaffPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: ReactivateResourceUseCaseInput): Promise<ReactivateResourceUseCaseResult> {
    const resource = await this.resourceRepo.findById(input.id, input.tenantId);
    if (!resource) throw new ResourceNotFoundError(input.id);

    // A STAFF wrapper must not be reactivated while its Staff row is still inactive — UC-048's
    // cascade deactivates the wrapper when Staff is deactivated, and reactivating the resource
    // alone (without the Staff row also being active again) would silently make an inactive
    // staff member schedulable again (Codex round-7 finding, PR #457).
    if (resource.type === ResourceType.STAFF && resource.refId) {
      const staff = await this.staffPort.findActiveById(resource.refId, input.tenantId);
      if (!staff) throw new ResourceStaffNotFoundError(resource.refId);
    }

    // Config-only, no event published — descoped during story discovery (2026-09-01): see
    // docs/ENGINEERING_RULES.md § Aggregate domain events → outbox (M20-S16 precedent).
    resource.reactivate();

    await this.txManager.run(async () => {
      await this.resourceRepo.save(resource);
    });

    return { id: resource.id, isActive: true };
  }
}
