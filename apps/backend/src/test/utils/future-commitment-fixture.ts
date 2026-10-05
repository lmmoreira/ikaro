import { uuidv7 } from '../../shared/domain/uuid-v7';
import { IOutboxPublisher } from '../../shared/ports/outbox-publisher.port';
import { InMemoryTenantLock } from '../infrastructure/in-memory-tenant-lock';
import {
  BookingBuilder,
  BookingLineBuilder,
  ResourceBuilder,
  ServiceBuilder,
} from '../builders/booking/index';
import { InMemoryBookingRepository } from '../repositories/booking/in-memory-booking.repository';
import { InMemoryFutureCommitmentExceptionRepository } from '../repositories/booking/in-memory-future-commitment-exception.repository';
import { InMemoryResourceOccupancyRepository } from '../repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../repositories/booking/in-memory-service.repository';
import { RaiseFutureCommitmentExceptionsForResourceUseCase } from '../../contexts/booking/application/use-cases/raise-future-commitment-exceptions-for-resource.use-case';
import { Booking, BookingStatus } from '../../contexts/booking/domain/booking.aggregate';
import { ResourceRequirement } from '../../contexts/booking/domain/resource-requirement';
import { Resource } from '../../contexts/booking/domain/resource.aggregate';
import { ResourceType } from '../../contexts/booking/domain/resource.types';
import { ResourceOccupancyLockState } from '../../contexts/booking/domain/resource-occupancy-lock-state';
import { Service } from '../../contexts/booking/domain/service.aggregate';

export const FCE_TENANT_ID = '00000000-0000-7000-8000-000000000001';
export const FCE_OTHER_TENANT_ID = '99999999-0000-7000-8000-000000000099';

export interface SeedBookingOptions {
  service: Service;
  resource: Resource;
  status?: BookingStatus;
  startsInHours?: number;
  durationMins?: number;
  lockState?: ResourceOccupancyLockState;
  recurringScheduleId?: string | null;
  tenantId?: string;
}

// The in-memory world the worklist specs (raise, list, resolve, and the two deactivation triggers)
// share: every repository is the real InMemoryXxx double, wired the same way the module wires the
// real ones, so a spec exercises the actual raise/resolve logic end to end without a database.
export class FutureCommitmentFixture {
  readonly bookingRepo = new InMemoryBookingRepository();
  readonly serviceRepo = new InMemoryServiceRepository();
  readonly resourceRepo = new InMemoryResourceRepository();
  readonly occupancyRepo = new InMemoryResourceOccupancyRepository();
  readonly exceptionRepo: InMemoryFutureCommitmentExceptionRepository;
  readonly tenantLock = new InMemoryTenantLock();
  readonly raise: RaiseFutureCommitmentExceptionsForResourceUseCase;

  // Pass an outbox publisher to observe the events the worklist aggregate drains on save().
  constructor(outboxPublisher?: IOutboxPublisher) {
    this.exceptionRepo = new InMemoryFutureCommitmentExceptionRepository(outboxPublisher);
    this.raise = new RaiseFutureCommitmentExceptionsForResourceUseCase(
      this.bookingRepo,
      this.serviceRepo,
      this.resourceRepo,
      this.occupancyRepo,
      this.exceptionRepo,
      this.tenantLock,
    );
  }

  async addResource(
    name: string,
    type: ResourceType = ResourceType.ROOM,
    tenantId: string = FCE_TENANT_ID,
  ): Promise<Resource> {
    const builder = new ResourceBuilder().withTenantId(tenantId).withType(type).withName(name);
    // A STAFF resource wraps a staff member and must carry its id.
    if (type === ResourceType.STAFF) builder.withRefId(uuidv7());
    const resource = builder.build();
    await this.resourceRepo.save(resource);
    return resource;
  }

  async addResourceWithTurnover(
    name: string,
    turnoverMinutes: number,
    type: ResourceType = ResourceType.ROOM,
  ): Promise<Resource> {
    const resource = new ResourceBuilder()
      .withTenantId(FCE_TENANT_ID)
      .withType(type)
      .withName(name)
      .withTurnoverMinutes(turnoverMinutes)
      .build();
    await this.resourceRepo.save(resource);
    return resource;
  }

  async addService(
    type: ResourceType = ResourceType.ROOM,
    pool: string[] | null = null,
    tenantId: string = FCE_TENANT_ID,
  ): Promise<Service> {
    const service = new ServiceBuilder()
      .withTenantId(tenantId)
      // addBooking() seeds a gap-free window, so the service must not carry a buffer either.
      .withBufferAfterMinutes(0)
      .withName('Sessão')
      .withResourceRequirements([
        ResourceRequirement.create({ type, selectionMode: 'AUTO_ANY', resourcePoolIds: pool }),
      ])
      .build();
    await this.serviceRepo.save(service);
    return service;
  }

  // One single-line booking with one occupancy row on `resource`.
  async addBooking(options: SeedBookingOptions): Promise<Booking> {
    const tenantId = options.tenantId ?? FCE_TENANT_ID;
    const durationMins = options.durationMins ?? 60;
    const startsAt = new Date(Date.now() + (options.startsInHours ?? 48) * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + durationMins * 60_000);
    const lineId = uuidv7();

    const line = new BookingLineBuilder()
      .withLineId(lineId)
      .withTenantId(tenantId)
      .withServiceId(options.service.id)
      .withServiceNameAtBooking(options.service.name)
      .withDurationMinsAtBooking(durationMins)
      .build();
    const booking = new BookingBuilder()
      .withTenantId(tenantId)
      .withStatus(options.status ?? BookingStatus.APPROVED)
      .withScheduledAt(startsAt)
      .withTotalDurationMins(durationMins)
      .withLines([line])
      .withRecurringScheduleId(options.recurringScheduleId ?? null)
      .build();
    await this.bookingRepo.save(booking);

    await this.occupancyRepo.assign(
      tenantId,
      lineId,
      [
        {
          resourceId: options.resource.id,
          resourceType: options.resource.type,
          resourceName: options.resource.name,
          legIndex: null,
          quantityPosition: null,
          startsAt,
          endsAt,
          selectionMode: 'AUTO_ANY',
          isBundleMember: false,
          gapMinutes: null,
          gapSource: null,
        },
      ],
      options.lockState ?? 'COMMITTED',
      null,
    );
    this.occupancyRepo.registerBookingLine(lineId, booking.id);
    return booking;
  }
}
