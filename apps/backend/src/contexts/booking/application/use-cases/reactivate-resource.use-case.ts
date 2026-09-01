import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';

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
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: ReactivateResourceUseCaseInput): Promise<ReactivateResourceUseCaseResult> {
    const resource = await this.resourceRepo.findById(input.id, input.tenantId);
    if (!resource) throw new ResourceNotFoundError(input.id);

    // Config-only, no event published — descoped during story discovery (2026-09-01): see
    // docs/ENGINEERING_RULES.md § Aggregate domain events → outbox (M20-S16 precedent).
    resource.reactivate();

    await this.txManager.run(async () => {
      await this.resourceRepo.save(resource);
    });

    return { id: resource.id, isActive: true };
  }
}
