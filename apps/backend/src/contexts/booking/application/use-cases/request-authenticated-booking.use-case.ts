import { Inject, Injectable } from '@nestjs/common';
import { Address } from '../../../../shared/value-objects/address';
import { IEventBus, EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { Booking } from '../../domain/booking.aggregate';
import {
  BookingCustomerNotFoundError,
  BookingServiceNotActiveError,
  BookingServiceNotInTenantError,
  CustomerPhoneNotSetError,
} from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import { ICustomerProfilePort, CUSTOMER_PROFILE_PORT } from '../ports/customer-profile.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { RequestAuthenticatedBookingDto } from '../dtos/request-authenticated-booking.dto';
import { buildLineInputs, toBookingResult, BookingRequestResult } from './booking-request.helpers';

export type RequestAuthenticatedBookingUseCaseResult = BookingRequestResult;

@Injectable()
export class RequestAuthenticatedBookingUseCase {
  constructor(
    @Inject(CUSTOMER_PROFILE_PORT) private readonly customerProfilePort: ICustomerProfilePort,
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    private readonly slotConflictService: BookingSlotConflictService,
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(
    dto: RequestAuthenticatedBookingDto,
  ): Promise<RequestAuthenticatedBookingUseCaseResult> {
    const tenantId = this.tenantContext.tenantId;
    const correlationId = this.tenantContext.correlationId;
    const customerId = this.tenantContext.actorId!;

    const customer = await this.customerProfilePort.findById(customerId, tenantId);
    if (!customer) throw new BookingCustomerNotFoundError(customerId);
    if (!customer.phone) throw new CustomerPhoneNotSetError();

    const services = await this.serviceRepo.findByIds(dto.serviceIds, tenantId);
    const serviceMap = new Map(services.map((s) => [s.id, s]));
    const uniqueIds = [...new Set(dto.serviceIds)];
    for (const serviceId of uniqueIds) {
      const service = serviceMap.get(serviceId);
      if (!service) throw new BookingServiceNotInTenantError(serviceId);
      if (!service.isActive) throw new BookingServiceNotActiveError(serviceId);
    }

    const requiresPickup = dto.serviceIds.some((id) => serviceMap.get(id)?.requiresPickupAddress);

    let pickupAddress: Address | undefined;
    if (dto.pickupAddress) {
      pickupAddress = Address.create({
        ...dto.pickupAddress,
        complement: dto.pickupAddress.complement ?? undefined,
      });
    } else if (requiresPickup && customer.defaultAddress) {
      pickupAddress = customer.defaultAddress;
    }

    const scheduledAt = new Date(dto.scheduledAt);
    const totalDurationMins = dto.serviceIds.reduce(
      (sum, id) => sum + (serviceMap.get(id)?.durationMinutes ?? 0),
      0,
    );

    await this.slotConflictService.assertSlotFree(tenantId, scheduledAt, totalDurationMins);

    const lineInputs = buildLineInputs(dto.serviceIds, serviceMap);

    const contactAddress = customer.defaultAddress ?? undefined;

    const booking = Booking.requestBooking({
      tenantId,
      contactEmail: customer.email,
      contactName: customer.name,
      contactPhone: customer.phone,
      scheduledAt,
      lineInputs,
      type: 'CUSTOMER',
      correlationId,
      customerId,
      contactAddress,
      pickupAddress,
      beforeServicePhotoUrls: dto.beforeServicePhotoUrls,
    });

    await this.txManager.run(async () => {
      await this.bookingRepo.save(booking);
    });

    for (const event of booking.clearDomainEvents()) {
      await this.eventBus.publish(event);
    }

    return this.toResult(booking);
  }

  private toResult(booking: Booking): RequestAuthenticatedBookingUseCaseResult {
    return toBookingResult(booking);
  }
}
