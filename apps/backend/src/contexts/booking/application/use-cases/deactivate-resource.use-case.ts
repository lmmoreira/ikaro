import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ResourceNotFoundError } from '../../domain/errors/resource.error';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { RaiseFutureCommitmentExceptionsForResourceUseCase } from './raise-future-commitment-exceptions-for-resource.use-case';

export interface DeactivateResourceUseCaseInput {
  id: string;
  tenantId: string;
  correlationId: string;
}

@Injectable()
export class DeactivateResourceUseCase {
  constructor(
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly raiseExceptions: RaiseFutureCommitmentExceptionsForResourceUseCase,
  ) {}

  async execute(input: DeactivateResourceUseCaseInput): Promise<void> {
    const resource = await this.resourceRepo.findById(input.id, input.tenantId);
    if (!resource) throw new ResourceNotFoundError(input.id);

    resource.deactivate();

    await this.txManager.run(async () => {
      await this.resourceRepo.save(resource);
      // UC-047/UC-073: every future booking on the resource becomes a worklist entry — same
      // transaction, so the deactivation and its impact record commit (or roll back) together.
      await this.raiseExceptions.execute({
        tenantId: input.tenantId,
        resourceId: input.id,
        correlationId: input.correlationId,
      });
    });
  }
}
