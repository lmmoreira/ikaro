import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { Money } from '../../../../shared/value-objects/money';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { Service } from '../../domain/service.aggregate';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { IResourceRepository, RESOURCE_REPOSITORY } from '../ports/resource-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { UpdateServiceDto } from '../dtos/update-service.dto';
import { toClassResourceSlot } from '../dtos/resource-requirement.dto';
import { ServiceUseCaseResult, toServiceResult } from './service-result.mapper';
import { resolveActiveResourceIdsByType } from './active-resource-types.util';

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
    @Inject(RESOURCE_REPOSITORY) private readonly resourceRepo: IResourceRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(input: UpdateServiceUseCaseInput): Promise<UpdateServiceUseCaseResult> {
    const { id, tenantId, currency, locale } = input;

    const service = await this.txManager.run(async () => {
      // findByIdForUpdate (not findById) — reads under a real Postgres row lock, held until
      // this transaction commits. Serializes against any other findByIdForUpdate() caller on the
      // same row: a concurrent PATCH to this same service (lost-update protection), and
      // RequestBookingUseCase's own findByIdForUpdate() lock on every service it books
      // (booking-request.helpers.ts's persistRequestedBooking) — closing the TOCTOU race where a
      // service's first booking could be created concurrently with a bookingModel change,
      // violating UC-056's immutable-after-history invariant (mirrors
      // UpdateTenantSettingsUseCase's identical use of findByIdForUpdate for a cross-use-case
      // race).
      const current = await this.serviceRepo.findByIdForUpdate(id, tenantId);
      if (!current) throw new ServiceNotFoundError(id);

      const name = input.name ?? current.name;
      const description = input.description === undefined ? current.description : input.description;
      const price =
        input.priceAmount === undefined ? current.price : Money.from(input.priceAmount, currency);
      const durationMinutes = input.durationMinutes ?? current.durationMinutes;
      const loyaltyPointsValue = input.loyaltyPointsValue ?? current.loyaltyPointsValue;
      const requiresPickupAddress = input.requiresPickupAddress ?? current.requiresPickupAddress;

      current.update(
        name,
        description,
        price,
        durationMinutes,
        loyaltyPointsValue,
        requiresPickupAddress,
      );

      if (input.bufferAfterMinutes !== undefined) {
        current.setBufferAfterMinutes(input.bufferAfterMinutes);
      }

      await this.applyBookingModelChange(current, id, tenantId, input);

      await this.serviceRepo.save(current);
      return current;
    });

    await this.bookingPlatform.revalidatePublicPages(tenantId);

    return toServiceResult(service, locale);
  }

  // Split out of execute() to stay under docs/CODE_STANDARDS.md's function-length limit — a
  // SESSION conversion must supply its classResourceSlots in the same request, since there is no
  // separate slot-management endpoint this milestone (see Service.changeBookingModel()).
  private async applyBookingModelChange(
    current: Service,
    id: string,
    tenantId: string,
    input: UpdateServiceUseCaseInput,
  ): Promise<void> {
    if (input.bookingModel === undefined || input.bookingModel === current.bookingModel) return;
    const hasBookingHistory = await this.bookingRepo.existsByServiceId(id, tenantId);
    const classResourceSlots = (input.classResourceSlots ?? []).map(toClassResourceSlot);
    const activeResourceIdsByType = await resolveActiveResourceIdsByType(
      this.resourceRepo,
      tenantId,
      classResourceSlots.map((s) => s.type),
    );
    current.changeBookingModel(
      input.bookingModel,
      hasBookingHistory,
      classResourceSlots,
      activeResourceIdsByType,
    );
  }
}
