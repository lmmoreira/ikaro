import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { Money } from '../../../../shared/value-objects/money';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { CreateServiceDto } from '../dtos/create-service.dto';
import { Service } from '../../domain/service.aggregate';

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
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(dto: CreateServiceDto): Promise<CreateServiceUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const price = Money.from(dto.priceAmount, 'BRL');

    const service = Service.create(
      tenantId,
      dto.name,
      price,
      dto.durationMinutes,
      dto.loyaltyPointsValue,
      dto.requiresPickupAddress ?? false,
      dto.description,
    );

    await this.txManager.run(async () => {
      await this.serviceRepo.save(service);
    });

    return this.toResult(service);
  }

  private toResult(service: Service): CreateServiceUseCaseResult {
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      price: {
        amount: service.price.amount.toNumber(),
        currency: service.price.currency,
        formatted: service.price.format(),
      },
      durationMinutes: service.durationMinutes,
      loyaltyPointsValue: service.loyaltyPointsValue,
      requiresPickupAddress: service.requiresPickupAddress,
      isActive: service.isActive,
      createdAt: service.createdAt.toISOString(),
    };
  }
}
