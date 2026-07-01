import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';

export type ActivateServiceInput = {
  id: string;
  tenantId: string;
};

export interface ActivateServiceUseCaseResult {
  id: string;
  isActive: true;
}

@Injectable()
export class ActivateServiceUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: ActivateServiceInput): Promise<ActivateServiceUseCaseResult> {
    const { id, tenantId } = input;
    const service = await this.serviceRepo.findById(id, tenantId);
    if (!service) throw new ServiceNotFoundError(id);

    service.activate();

    await this.txManager.run(async () => {
      await this.serviceRepo.save(service);
    });

    return { id: service.id, isActive: true };
  }
}
