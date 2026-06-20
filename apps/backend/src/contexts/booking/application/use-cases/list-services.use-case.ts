import { Inject, Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import {
  ITenantLocalizationPort,
  TENANT_LOCALIZATION_PORT,
} from '../ports/tenant-localization.port';
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
    @Inject(TENANT_LOCALIZATION_PORT)
    private readonly localizationPort: ITenantLocalizationPort,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(): Promise<ListServicesUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const services = await this.serviceRepo.findAllByTenant(tenantId, true);
    const { locale } = await this.localizationPort.getLocalization(tenantId);
    return { items: services.map((s) => this.toItem(s, locale)) };
  }

  private toItem(service: Service, locale: string): ServiceListItem {
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
