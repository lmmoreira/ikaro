import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ScheduleClosureBuilder } from '../../../../test/builders/booking/schedule-closure.builder';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/schedule-opening.builder';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { addDays, nextWeekday } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { GetAvailabilitySummaryUseCase } from './get-availability-summary.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

// A Monday–Sunday week window always in the future
const monday = nextWeekday(1);
const sunday = nextWeekday(0, 2); // Sunday after next Monday

describe('GetAvailabilitySummaryUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let closureRepo: InMemoryScheduleClosureRepository;
  let openingRepo: InMemoryScheduleOpeningRepository;
  let useCase: GetAvailabilitySummaryUseCase;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    closureRepo = new InMemoryScheduleClosureRepository();
    openingRepo = new InMemoryScheduleOpeningRepository();
    useCase = new GetAvailabilitySummaryUseCase(
      new RequestContextBuilder().withTenantId(TENANT_ID).build(),
      serviceRepo,
      closureRepo,
      openingRepo,
      new InMemoryBookingAvailabilityPort(),
      new AvailabilityService(),
    );
  });

  it('returns one entry per day in the range', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);
    const from = monday;
    const to = addDays(monday, 6);

    const result = await useCase.execute({ from, to, serviceIds: [service.id] });

    expect(result).toHaveLength(7);
    expect(result[0].date).toBe(from);
    expect(result[6].date).toBe(to);
  });

  it('returns available:true for an open business day', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    const result = await useCase.execute({ from: monday, to: monday, serviceIds: [service.id] });

    expect(result[0].available).toBe(true);
    expect(result[0].slotCount).toBeGreaterThan(0);
  });

  it('returns available:false and slotCount:0 for a closed day (Sunday, no opening)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    const result = await useCase.execute({ from: sunday, to: sunday, serviceIds: [service.id] });

    expect(result[0].available).toBe(false);
    expect(result[0].slotCount).toBe(0);
  });

  it('returns available:false and slotCount:0 for a day with a full-day closure', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);
    await closureRepo.save(
      new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate(monday).build(),
    );

    const result = await useCase.execute({ from: monday, to: monday, serviceIds: [service.id] });

    expect(result[0].available).toBe(false);
    expect(result[0].slotCount).toBe(0);
  });

  it('returns available:true for a Sunday with a ScheduleOpening', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);
    await openingRepo.save(
      new ScheduleOpeningBuilder()
        .withTenantId(TENANT_ID)
        .withDate(sunday)
        .withStartTime('09:00')
        .withEndTime('14:00')
        .build(),
    );

    const result = await useCase.execute({ from: sunday, to: sunday, serviceIds: [service.id] });

    expect(result[0].available).toBe(true);
    expect(result[0].slotCount).toBeGreaterThan(0);
  });

  it('throws AvailabilityRangeInvalidError when from > to', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({ from: addDays(monday, 1), to: monday, serviceIds: [service.id] }),
    ).rejects.toMatchObject({ name: 'AvailabilityRangeInvalidError' });
  });

  it('throws AvailabilityRangeInvalidError when range exceeds maxBookingAdvanceDays (90)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({ from: monday, to: addDays(monday, 91), serviceIds: [service.id] }),
    ).rejects.toMatchObject({ name: 'AvailabilityRangeInvalidError' });
  });

  it('throws BookingDomainError when a serviceId does not belong to tenant', async () => {
    const unknownId = '00000000-0000-7000-8000-000000000099';

    await expect(
      useCase.execute({ from: monday, to: monday, serviceIds: [unknownId] }),
    ).rejects.toMatchObject({ name: 'BookingDomainError' });
  });

  it('marks past dates as available:false without throwing', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);
    const past = '2020-01-01';
    const pastPlusOne = '2020-01-02';

    const result = await useCase.execute({
      from: past,
      to: pastPlusOne,
      serviceIds: [service.id],
    });

    expect(result).toHaveLength(2);
    expect(result[0].available).toBe(false);
    expect(result[1].available).toBe(false);
  });
});
