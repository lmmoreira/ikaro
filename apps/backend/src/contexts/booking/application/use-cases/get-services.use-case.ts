import { Inject, Injectable } from '@nestjs/common';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { Service } from '../../domain/service.aggregate';

export interface ServiceItemResult {
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

export interface GetServicesUseCaseInput {
  tenantId: string;
  ids?: string[];
  status?: 'ACTIVE' | 'INACTIVE' | 'ANY';
  search?: string;
  locale?: string;
}

export interface GetServicesUseCaseResult {
  items: ServiceItemResult[];
}

@Injectable()
export class GetServicesUseCase {
  constructor(@Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository) {}

  async execute(input: GetServicesUseCaseInput): Promise<GetServicesUseCaseResult> {
    const services = await this.serviceRepo.findAllByTenant(input.tenantId, {
      ids: input.ids,
      status: input.status,
      search: input.search,
    });
    const locale = input.locale ?? 'pt-BR';
    return { items: services.map((s) => this.toItem(s, locale)) };
  }

  private toItem(service: Service, locale: string): ServiceItemResult {
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
