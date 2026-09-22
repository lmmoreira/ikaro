import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';

export interface DeactivateResourceUseCaseInput {
  id: string;
  tenantId: string;
}

@Injectable()
export class DeactivateResourceUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: DeactivateResourceUseCaseInput): Promise<void> {
    const resource = await this.resourceRepo.findById(input.id, input.tenantId);
    if (!resource) throw new ResourceNotFoundError(input.id);

    // No-op resolution worklist until M22+ ships bookings/sessions referencing Resource —
    // still calling the same aggregate method so M22+ can extend it without changing this
    // use case's own shape (docs/04-USE_CASES.md UC-047).
    resource.deactivate();

    await this.txManager.run(async () => {
      await this.resourceRepo.save(resource);
    });
  }
}
