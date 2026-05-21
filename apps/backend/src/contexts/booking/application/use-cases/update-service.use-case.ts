import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { Money } from '../../../../shared/value-objects/money';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { UpdateServiceDto } from '../dtos/update-service.dto';

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
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(id: string, dto: UpdateServiceDto): Promise<UpdateServiceUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const service = await this.serviceRepo.findById(id, tenantId);
    if (!service) throw new ServiceNotFoundError(id);

    const name = dto.name ?? service.name;
    const description = dto.description === undefined ? service.description : dto.description;
    const price =
      dto.priceAmount === undefined ? service.price : Money.from(dto.priceAmount, 'BRL');
    const durationMinutes = dto.durationMinutes ?? service.durationMinutes;
    const loyaltyPointsValue = dto.loyaltyPointsValue ?? service.loyaltyPointsValue;
    const requiresPickupAddress = dto.requiresPickupAddress ?? service.requiresPickupAddress;

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
