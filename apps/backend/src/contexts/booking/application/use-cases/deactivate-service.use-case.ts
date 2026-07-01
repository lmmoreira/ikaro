import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';

export type DeactivateServiceInput = {
  id: string;
  tenantId: string;
};

export interface DeactivateServiceUseCaseResult {
  id: string;
  isActive: false;
}

@Injectable()
export class DeactivateServiceUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: DeactivateServiceInput): Promise<DeactivateServiceUseCaseResult> {
    const { id, tenantId } = input;
    const service = await this.serviceRepo.findById(id, tenantId);
    if (!service) throw new ServiceNotFoundError(id);

    service.deactivate();

    await this.txManager.run(async () => {
      await this.serviceRepo.save(service);
    });

    return { id: service.id, isActive: false };
  }
}
