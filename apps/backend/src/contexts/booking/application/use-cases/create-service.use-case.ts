import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Money } from '../../../../shared/value-objects/money';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { CreateServiceDto } from '../dtos/create-service.dto';
import { toClassResourceSlot } from '../dtos/resource-requirement.dto';
import { Service } from '../../domain/service.aggregate';
import { ServiceUseCaseResult, toServiceResult } from './service-result.mapper';
import { resolveActiveResourceIdsByType } from './active-resource-types.util';

export type CreateServiceUseCaseInput = CreateServiceDto & {
  tenantId: string;
  currency: string;
  locale: string;
  tenantServiceBufferMinutes: number;
};

export type CreateServiceUseCaseResult = ServiceUseCaseResult;

@Injectable()
export class CreateServiceUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: CreateServiceUseCaseInput): Promise<CreateServiceUseCaseResult> {
    const { tenantId, currency, locale } = input;
    const price = Money.from(input.priceAmount, currency);
    const bookingModel = input.bookingModel ?? 'APPOINTMENT';
    const classResourceSlots = (input.classResourceSlots ?? []).map(toClassResourceSlot);
    const activeResourceIdsByType = await resolveActiveResourceIdsByType(
      this.resourceRepo,
      tenantId,
      classResourceSlots.map((s) => s.type),
    );

    const service = Service.create({
      tenantId,
      name: input.name,
      price,
      durationMinutes: input.durationMinutes,
      loyaltyPointsValue: input.loyaltyPointsValue,
      requiresPickupAddress: input.requiresPickupAddress ?? false,
      isActive: input.isActive ?? true,
      description: input.description,
      bookingModel,
      tenantServiceBufferMinutes: input.tenantServiceBufferMinutes,
      classResourceSlots,
      activeResourceIdsByType,
    });

    await this.txManager.run(async () => {
      await this.serviceRepo.save(service);
    });

    await this.bookingPlatform.revalidatePublicPages(tenantId);

    const autoApproveEnabled = await this.bookingPlatform.getAutoApproveEnabled(tenantId);
    return toServiceResult(service, locale, autoApproveEnabled);
  }
}
