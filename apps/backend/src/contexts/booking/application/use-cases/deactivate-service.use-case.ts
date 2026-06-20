import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { RequestContext } from '../../../../shared/request/request-context';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';

export interface DeactivateServiceUseCaseResult {
  id: string;
  isActive: false;
}

@Injectable()
export class DeactivateServiceUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly tenantContext: RequestContext,
  ) {}

  async execute(id: string): Promise<DeactivateServiceUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const service = await this.serviceRepo.findById(id, tenantId);
    if (!service) throw new ServiceNotFoundError(id);

    service.deactivate();

    await this.txManager.run(async () => {
      await this.serviceRepo.save(service);
    });

    return { id: service.id, isActive: false };
  }
}
