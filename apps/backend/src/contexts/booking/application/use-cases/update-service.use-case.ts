import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Money } from '../../../../shared/value-objects/money';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { UpdateServiceDto } from '../dtos/update-service.dto';

export type UpdateServiceInput = UpdateServiceDto & {
  id: string;
  tenantId: string;
  currency: string;
  locale: string;
};

export interface UpdateServiceUseCaseResult {
  id: string;
  name: string;
  description: string | null;
  price: { amount: number; currency: string; formatted: string };
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: string;
}

@Injectable()
export class UpdateServiceUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: UpdateServiceInput): Promise<UpdateServiceUseCaseResult> {
    const { id, tenantId, currency, locale } = input;
    const service = await this.serviceRepo.findById(id, tenantId);
    if (!service) throw new ServiceNotFoundError(id);

    const name = input.name ?? service.name;
    const description = input.description === undefined ? service.description : input.description;
    const price =
      input.priceAmount === undefined ? service.price : Money.from(input.priceAmount, currency);
    const durationMinutes = input.durationMinutes ?? service.durationMinutes;
    const loyaltyPointsValue = input.loyaltyPointsValue ?? service.loyaltyPointsValue;
    const requiresPickupAddress = input.requiresPickupAddress ?? service.requiresPickupAddress;

    service.update(
      name,
      description,
      price,
      durationMinutes,
      loyaltyPointsValue,
      requiresPickupAddress,
    );

    await this.txManager.run(async () => {
      await this.serviceRepo.save(service);
    });

    return {
      id: service.id,
      name: service.name,
      description: service.description,
      price: {
        amount: service.price.amount.toNumber(),
        currency: service.price.currency,
        formatted: service.price.format(locale),
      },
      durationMinutes: service.durationMinutes,
      loyaltyPointsValue: service.loyaltyPointsValue,
      requiresPickupAddress: service.requiresPickupAddress,
      isActive: service.isActive,
      createdAt: service.createdAt.toISOString(),
    };
  }
}
