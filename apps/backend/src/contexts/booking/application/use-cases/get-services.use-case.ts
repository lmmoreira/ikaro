import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { ServiceUseCaseResult, toServiceResult } from './service-result.mapper';

export type ServiceItemResult = ServiceUseCaseResult;

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
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
  ) {}

  async execute(input: GetServicesUseCaseInput): Promise<GetServicesUseCaseResult> {
    const services = await this.serviceRepo.findAllByTenant(input.tenantId, {
      ids: input.ids,
      status: input.status,
      search: input.search,
    });
    const locale = input.locale ?? 'pt-BR';
    // One fetch for the whole list — not per service — since it's the same tenant-wide default.
    const autoApproveEnabled = await this.bookingPlatform.getAutoApproveEnabled(input.tenantId);
    return { items: services.map((s) => toServiceResult(s, locale, autoApproveEnabled)) };
  }
}
