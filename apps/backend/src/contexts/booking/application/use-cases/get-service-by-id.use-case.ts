import { Inject, Injectable } from '@nestjs/common';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
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
  constructor(@Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository) {}

  async execute(input: GetServiceByIdUseCaseInput): Promise<GetServiceByIdUseCaseResult> {
    const { id, tenantId, locale } = input;
    const service = await this.serviceRepo.findById(id, tenantId);
    if (!service) throw new ServiceNotFoundError(id);

    return toServiceResult(service, locale);
  }
}
