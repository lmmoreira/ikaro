import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ScheduleClosureBuilder } from '../../../../test/builders/booking/schedule-closure.builder';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { nextWeekday, pastDate } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { GetAvailabilityUseCase } from '../../application/use-cases/get-availability.use-case';
import { ScheduleAvailabilityController } from './schedule-availability.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const monday = nextWeekday(1);

describe('ScheduleAvailabilityController', () => {
  let serviceRepo: InMemoryServiceRepository;
  let closureRepo: InMemoryScheduleClosureRepository;
  let controller: ScheduleAvailabilityController;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    closureRepo = new InMemoryScheduleClosureRepository();
    controller = new ScheduleAvailabilityController(
      new RequestContextBuilder().withTenantId(TENANT_ID).build(),
      new GetAvailabilityUseCase(
        serviceRepo,
        closureRepo,
        new InMemoryScheduleOpeningRepository(),
        new InMemoryBookingAvailabilityPort(),
        new AvailabilityService(),
      ),
    );
  });

  it('returns slots for a valid request', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    const result = await controller.get({ date: monday, serviceIds: [service.id] });

    expect(result.date).toBe(monday);
    expect(result).toHaveProperty('slots');
    expect(result).toHaveProperty('available');
  });

  it('maps AvailabilityDateInPastError to 422', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    const err = await controller
      .get({ date: pastDate(1), serviceIds: [service.id] })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('maps unknown serviceId to 404', async () => {
    const unknownId = '00000000-0000-7000-8000-000000000099';

    const err = await controller
      .get({ date: monday, serviceIds: [unknownId] })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('maps inactive serviceId to 400', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).withIsActive(false).build();
    await serviceRepo.save(service);

    const err = await controller
      .get({ date: monday, serviceIds: [service.id] })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('returns available:false when full-day closure exists', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);
    await closureRepo.save(
      new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate(monday).build(),
    );

    const result = await controller.get({ date: monday, serviceIds: [service.id] });

    expect(result.available).toBe(false);
    expect(result.slots).toHaveLength(0);
  });
});
