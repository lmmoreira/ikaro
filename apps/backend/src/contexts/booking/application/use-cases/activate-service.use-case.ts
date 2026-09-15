import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';

export type ActivateServiceUseCaseInput = {
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
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: ActivateServiceUseCaseInput): Promise<ActivateServiceUseCaseResult> {
    const { id, tenantId } = input;

    const service = await this.txManager.run(async () => {
      // findByIdForUpdate (not findById) — save() wholesale-replaces every child table
      // (resourceRequirements/legs/classResourceSlots) from this in-memory aggregate's current
      // state, so a stale pre-transaction read here would silently overwrite a concurrent
      // resource-requirements/legs update back to its old state. See
      // update-service.use-case.ts's identical comment.
      const current = await this.serviceRepo.findByIdForUpdate(id, tenantId);
      if (!current) throw new ServiceNotFoundError(id);

      current.activate();
      await this.serviceRepo.save(current);
      return current;
    });

    await this.bookingPlatform.revalidatePublicPages(tenantId);

    return { id: service.id, isActive: true };
  }
}
