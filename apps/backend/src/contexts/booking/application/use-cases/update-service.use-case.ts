import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Money } from '../../../../shared/value-objects/money';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { UpdateServiceDto } from '../dtos/update-service.dto';
import { ServiceUseCaseResult, toServiceResult } from './service-result.mapper';

export type UpdateServiceUseCaseInput = UpdateServiceDto & {
  id: string;
  tenantId: string;
  currency: string;
  locale: string;
};

export type UpdateServiceUseCaseResult = ServiceUseCaseResult;

@Injectable()
export class UpdateServiceUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: UpdateServiceUseCaseInput): Promise<UpdateServiceUseCaseResult> {
    const { id, tenantId, currency, locale } = input;
    const service = await this.serviceRepo.findById(id, tenantId);
    if (!service) throw new ServiceNotFoundError(id);

    const name = input.name ?? service.name;
    const description = input.description === undefined ? service.description : input.description;
    const price =
      input.priceAmount === undefined ? service.price : Money.from(input.priceAmount, currency);
    const durationMinutes = input.durationMinutes ?? service.durationMinutes;
    const loyaltyPointsValue = input.loyaltyPointsValue ?? service.loyaltyPointsValue;
    const requiresPickupAddress = input.requiresPickupAddress ?? service.requiresPickupAddress;

    service.update(
      name,
      description,
      price,
      durationMinutes,
      loyaltyPointsValue,
      requiresPickupAddress,
    );

    if (input.bufferAfterMinutes !== undefined) {
      service.setBufferAfterMinutes(input.bufferAfterMinutes);
    }
    if (input.bookingModel !== undefined && input.bookingModel !== service.bookingModel) {
      const hasBookingHistory = await this.bookingRepo.existsByServiceId(id, tenantId);
      service.changeBookingModel(input.bookingModel, hasBookingHistory);
    }

    await this.txManager.run(async () => {
      await this.serviceRepo.save(service);
    });

    await this.bookingPlatform.revalidatePublicPages(tenantId);

    return toServiceResult(service, locale);
  }
}
