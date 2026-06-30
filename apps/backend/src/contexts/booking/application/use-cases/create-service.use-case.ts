import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Money } from '../../../../shared/value-objects/money';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { CreateServiceDto } from '../dtos/create-service.dto';
import { Service } from '../../domain/service.aggregate';

export type CreateServiceInput = CreateServiceDto & {
  tenantId: string;
  currency: string;
  locale: string;
};

export interface CreateServiceUseCaseResult {
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
export class CreateServiceUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: CreateServiceInput): Promise<CreateServiceUseCaseResult> {
    const { tenantId, currency, locale } = input;
    const price = Money.from(input.priceAmount, currency);

    const service = Service.create(
      tenantId,
      input.name,
      price,
      input.durationMinutes,
      input.loyaltyPointsValue,
      input.requiresPickupAddress ?? false,
      input.description,
    );

    await this.txManager.run(async () => {
      await this.serviceRepo.save(service);
    });

    return this.toResult(service, locale);
  }

  private toResult(service: Service, locale: string): CreateServiceUseCaseResult {
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
