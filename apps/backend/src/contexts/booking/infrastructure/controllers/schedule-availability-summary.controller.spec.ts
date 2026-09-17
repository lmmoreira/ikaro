import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { addDays, nextWeekday } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceType } from '../../domain/resource.types';
import { GetAvailabilitySummaryUseCase } from '../../application/use-cases/get-availability-summary.use-case';
import { ScheduleAvailabilitySummaryController } from './schedule-availability-summary.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const monday = nextWeekday(1);

describe('ScheduleAvailabilitySummaryController', () => {
  let serviceRepo: InMemoryServiceRepository;
  let controller: ScheduleAvailabilitySummaryController;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    const resourceRepo = new InMemoryResourceRepository();
    // M22-S03: the degenerate (tenant-wide) path resolves the tenant's LOCATION resource
    // (M21-S02's real backfill guarantees one always exists in production).
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.LOCATION).build(),
    );
    controller = new ScheduleAvailabilitySummaryController(
      new RequestContextBuilder().withTenantId(TENANT_ID).build(),
      new GetAvailabilitySummaryUseCase(
        serviceRepo,
        new InMemoryScheduleClosureRepository(),
        new InMemoryScheduleOpeningRepository(),
        resourceRepo,
        new InMemoryBookingAvailabilityPort(),
        new AvailabilityService(),
      ),
    );
  });

  it('returns one entry per day for a valid range', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    const result = await controller.get({
      from: monday,
      to: addDays(monday, 2),
      serviceIds: [service.id],
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toHaveProperty('date');
    expect(result[0]).toHaveProperty('available');
    expect(result[0]).toHaveProperty('slotCount');
  });

  it('maps AvailabilityRangeInvalidError (from > to) to 422', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    const err = await controller
      .get({ from: addDays(monday, 1), to: monday, serviceIds: [service.id] })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('maps unknown serviceId to 404', async () => {
    const unknownId = '00000000-0000-7000-8000-000000000099';

    const err = await controller
      .get({ from: monday, to: monday, serviceIds: [unknownId] })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
  });

  it('returns past dates as available:false without error', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    const result = await controller.get({
      from: '2020-01-01',
      to: '2020-01-01',
      serviceIds: [service.id],
    });

    expect(result[0].available).toBe(false);
    expect(result[0].slotCount).toBe(0);
  });

  it('includes both open and closed days in the same result', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);
    // monday=open, next sunday=closed (businessHours default)
    const sunday = nextWeekday(0, 2);

    const result = await controller.get({
      from: monday,
      to: sunday,
      serviceIds: [service.id],
    });

    const mondayEntry = result.find((r) => r.date === monday);
    const sundayEntry = result.find((r) => r.date === sunday);
    expect(mondayEntry?.available).toBe(true);
    expect(sundayEntry?.available).toBe(false);
  });
});
