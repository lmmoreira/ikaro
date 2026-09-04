import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ScheduleClosureBuilder } from '../../../../test/builders/booking/schedule-closure.builder';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/schedule-opening.builder';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { nextWeekday, pastDate } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { ResourceNotActiveError, ResourceNotFoundError } from '../../domain/errors/resource.error';
import { GetAvailabilityUseCase } from './get-availability.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const monday = nextWeekday(1);
const sunday = nextWeekday(0);

describe('GetAvailabilityUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let closureRepo: InMemoryScheduleClosureRepository;
  let openingRepo: InMemoryScheduleOpeningRepository;
  let resourceRepo: InMemoryResourceRepository;
  let bookingPort: InMemoryBookingAvailabilityPort;
  let useCase: GetAvailabilityUseCase;
  let settings: TenantSettings;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    closureRepo = new InMemoryScheduleClosureRepository();
    openingRepo = new InMemoryScheduleOpeningRepository();
    resourceRepo = new InMemoryResourceRepository();
    bookingPort = new InMemoryBookingAvailabilityPort();
    settings = TenantSettings.default();
    useCase = new GetAvailabilityUseCase(
      serviceRepo,
      closureRepo,
      openingRepo,
      resourceRepo,
      bookingPort,
      new AvailabilityService(),
    );
  });

  it('returns slots for a valid open day with active services', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).withDurationMinutes(60).build();
    await serviceRepo.save(service);

    const result = await useCase.execute({
      date: monday,
      serviceIds: [service.id],
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
    });

    expect(result.date).toBe(monday);
    expect(result.available).toBe(true);
    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.slots[0]).toHaveProperty('startsAt');
    expect(result.slots[0]).toHaveProperty('endsAt');
  });

  it('returns available:false and empty slots for a closed day (Sunday)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    const result = await useCase.execute({
      date: sunday,
      serviceIds: [service.id],
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
    });

    expect(result.available).toBe(false);
    expect(result.slots).toHaveLength(0);
  });

  it('returns available:false when a full-day closure exists', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);
    await closureRepo.save(
      new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate(monday).build(),
    );

    const result = await useCase.execute({
      date: monday,
      serviceIds: [service.id],
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
    });

    expect(result.available).toBe(false);
    expect(result.slots).toHaveLength(0);
  });

  it('returns slots within opening window when ScheduleOpening exists on Sunday', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).withDurationMinutes(60).build();
    await serviceRepo.save(service);
    await openingRepo.save(
      new ScheduleOpeningBuilder()
        .withTenantId(TENANT_ID)
        .withDate(sunday)
        .withStartTime('09:00')
        .withEndTime('14:00')
        .build(),
    );

    const result = await useCase.execute({
      date: sunday,
      serviceIds: [service.id],
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
    });

    expect(result.available).toBe(true);
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it('throws AvailabilityDateInPastError for a past date', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({
        date: pastDate(1),
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      }),
    ).rejects.toMatchObject({ name: 'AvailabilityDateInPastError' });
  });

  it('throws ServiceNotFoundError (404) when a serviceId does not belong to tenant', async () => {
    const unknownId = '00000000-0000-7000-8000-000000000099';

    await expect(
      useCase.execute({
        date: monday,
        serviceIds: [unknownId],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      }),
    ).rejects.toMatchObject({ name: 'ServiceNotFoundError' });
  });

  it('throws BookingServiceNotActiveError (400) when a service is inactive', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).withIsActive(false).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({
        date: monday,
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      }),
    ).rejects.toMatchObject({ name: 'BookingServiceNotActiveError' });
  });

  it('sums durations of multiple services', async () => {
    const s1 = new ServiceBuilder().withTenantId(TENANT_ID).withDurationMinutes(30).build();
    const s2 = new ServiceBuilder().withTenantId(TENANT_ID).withDurationMinutes(30).build();
    await serviceRepo.save(s1);
    await serviceRepo.save(s2);

    const result = await useCase.execute({
      date: monday,
      serviceIds: [s1.id, s2.id],
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
    });

    expect(result.slots.length).toBeGreaterThan(0);
    expect(result.available).toBe(true);
  });

  describe('resourceId (M21 Cluster 1)', () => {
    it('throws ResourceNotFoundError when resourceId does not exist', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
      await serviceRepo.save(service);

      await expect(
        useCase.execute({
          date: monday,
          serviceIds: [service.id],
          resourceId: '00000000-0000-7000-8000-000000000099',
          tenantId: TENANT_ID,
          businessHours: settings.businessHours,
          slotGranularityMinutes: settings.booking.slotGranularityMinutes,
          serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        }),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('throws ResourceNotActiveError when the resource is deactivated', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
      await serviceRepo.save(service);
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      resource.deactivate();
      await resourceRepo.save(resource);

      await expect(
        useCase.execute({
          date: monday,
          serviceIds: [service.id],
          resourceId: resource.id,
          tenantId: TENANT_ID,
          businessHours: settings.businessHours,
          slotGranularityMinutes: settings.booking.slotGranularityMinutes,
          serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        }),
      ).rejects.toThrow(ResourceNotActiveError);
    });

    it('a resource-scoped full-day closure blocks that resource while the tenant stays open', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
      await serviceRepo.save(service);
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await resourceRepo.save(resource);
      await closureRepo.save(
        new ScheduleClosureBuilder()
          .withTenantId(TENANT_ID)
          .withResourceId(resource.id)
          .withDate(monday)
          .build(),
      );

      const scoped = await useCase.execute({
        date: monday,
        serviceIds: [service.id],
        resourceId: resource.id,
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      });
      const tenantWide = await useCase.execute({
        date: monday,
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      });

      expect(scoped.available).toBe(false);
      expect(scoped.slots).toHaveLength(0);
      // The tenant-wide (no resourceId) call is unaffected — proves the closure is genuinely
      // scoped to just this resource, not accidentally blocking the whole tenant.
      expect(tenantWide.available).toBe(true);
    });

    it("opens a day the resource's own workingHours marks closed via a resource-scoped opening", async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
      await serviceRepo.save(service);
      const resourceWorkingHours = { ...settings.businessHours, monday: null };
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withTenantBusinessHours(settings.businessHours)
        .withWorkingHours(resourceWorkingHours)
        .build();
      await resourceRepo.save(resource);
      await openingRepo.save(
        new ScheduleOpeningBuilder()
          .withTenantId(TENANT_ID)
          .withResourceId(resource.id)
          .withDate(monday)
          .withStartTime('10:00')
          .withEndTime('12:00')
          .build(),
      );

      const result = await useCase.execute({
        date: monday,
        serviceIds: [service.id],
        resourceId: resource.id,
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      });

      expect(result.available).toBe(true);
      expect(result.slots.length).toBeGreaterThan(0);
    });
  });
});
