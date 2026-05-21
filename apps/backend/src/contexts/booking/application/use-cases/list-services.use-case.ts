import { Inject, Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { Service } from '../../domain/service.aggregate';

export interface ServiceListItem {
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

export interface ListServicesUseCaseResult {
  items: ServiceListItem[];
}

@Injectable()
export class ListServicesUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(): Promise<ListServicesUseCaseResult> {
    const services = await this.serviceRepo.findAllByTenant(this.tenantContext.tenantId, true);
    return { items: services.map((s) => this.toItem(s)) };
  }

  private toItem(service: Service): ServiceListItem {
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
