import { Inject, Injectable } from '@nestjs/common';
import { IStorageService, STORAGE_SERVICE } from '../../../../shared/ports/storage.service.port';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { ServiceUseCaseResult, toServiceResult } from './service-result.mapper';

export type GetServiceByIdUseCaseInput = {
  id: string;
  tenantId: string;
  locale: string;
};

export type GetServiceByIdUseCaseResult = ServiceUseCaseResult;

@Injectable()
export class GetServiceByIdUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(STORAGE_SERVICE) private readonly storageService: IStorageService,
  ) {}

  async execute(input: GetServiceByIdUseCaseInput): Promise<GetServiceByIdUseCaseResult> {
    const { id, tenantId, locale } = input;
    const service = await this.serviceRepo.findById(id, tenantId);
    if (!service) throw new ServiceNotFoundError(id);

    const autoApproveEnabled = await this.bookingPlatform.getAutoApproveEnabled(tenantId);
    const tenantWindow = await this.bookingPlatform.getTenantBookingWindow(tenantId);
    const tenantBufferMinutes = await this.bookingPlatform.getServiceBufferMinutes(tenantId);
    return toServiceResult(
      service,
      locale,
      autoApproveEnabled,
      tenantWindow,
      tenantBufferMinutes,
      (path) => this.storageService.getPublicUrl(path),
    );
  }
}
