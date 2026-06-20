import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../../../shared/request/request-context';
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
    private readonly tenantContext: RequestContext,
  ) {}

  async execute(): Promise<ListServicesUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const services = await this.serviceRepo.findAllByTenant(tenantId, true);
    const { language: locale } = this.tenantContext.settings.localization;
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
