import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ScheduleClosureBuilder } from '../../../../test/builders/booking/schedule-closure.builder';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/schedule-opening.builder';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { addDays, nextWeekday } from '../../../../test/utils/date-helpers';
import { AvailabilityService } from '../../domain/services/availability.service';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { ResourceNotActiveError, ResourceNotFoundError } from '../../domain/errors/resource.error';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { GetAvailabilitySummaryUseCase } from './get-availability-summary.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

// A Monday–Sunday week window always in the future
const monday = nextWeekday(1);
const sunday = nextWeekday(0, 2); // Sunday after next Monday

describe('GetAvailabilitySummaryUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let closureRepo: InMemoryScheduleClosureRepository;
  let openingRepo: InMemoryScheduleOpeningRepository;
  let resourceRepo: InMemoryResourceRepository;
  let useCase: GetAvailabilitySummaryUseCase;
  let settings: TenantSettings;

  beforeEach(async () => {
    serviceRepo = new InMemoryServiceRepository();
    closureRepo = new InMemoryScheduleClosureRepository();
    openingRepo = new InMemoryScheduleOpeningRepository();
    resourceRepo = new InMemoryResourceRepository();
    settings = TenantSettings.default();
    useCase = new GetAvailabilitySummaryUseCase(
      serviceRepo,
      closureRepo,
      openingRepo,
      resourceRepo,
      new InMemoryBookingAvailabilityPort(),
      new AvailabilityService(),
    );
    // M22-S03: the degenerate (tenant-wide) path now resolves the tenant's LOCATION resource
    // (M21-S02's real backfill guarantees one always exists in production) — every test in this
    // file implicitly relies on it existing unless it explicitly seeds its own resource(s).
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.LOCATION).build(),
    );
  });

  it('returns one entry per day in the range', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);
    const from = monday;
    const to = addDays(monday, 6);

    const result = await useCase.execute({
      from,
      to,
      serviceIds: [service.id],
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
    });

    expect(result).toHaveLength(7);
    expect(result[0].date).toBe(from);
    expect(result[6].date).toBe(to);
  });

  it('returns available:true for an open business day', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    const result = await useCase.execute({
      from: monday,
      to: monday,
      serviceIds: [service.id],
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
    });

    expect(result[0].available).toBe(true);
    expect(result[0].slotCount).toBeGreaterThan(0);
  });

  it('returns available:false and slotCount:0 for a closed day (Sunday, no opening)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    const result = await useCase.execute({
      from: sunday,
      to: sunday,
      serviceIds: [service.id],
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
    });

    expect(result[0].available).toBe(false);
    expect(result[0].slotCount).toBe(0);
  });

  it('returns available:false and slotCount:0 for a day with a full-day closure', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);
    await closureRepo.save(
      new ScheduleClosureBuilder().withTenantId(TENANT_ID).withDate(monday).build(),
    );

    const result = await useCase.execute({
      from: monday,
      to: monday,
      serviceIds: [service.id],
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
    });

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

    const result = await useCase.execute({
      from: sunday,
      to: sunday,
      serviceIds: [service.id],
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
    });

    expect(result[0].available).toBe(true);
    expect(result[0].slotCount).toBeGreaterThan(0);
  });

  it('throws AvailabilityRangeInvalidError when from > to', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({
        from: addDays(monday, 1),
        to: monday,
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
      }),
    ).rejects.toMatchObject({ name: 'AvailabilityRangeInvalidError' });
  });

  it('throws AvailabilityRangeInvalidError when range exceeds maxBookingAdvanceDays (90)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({
        from: monday,
        to: addDays(monday, 91),
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
      }),
    ).rejects.toMatchObject({ name: 'AvailabilityRangeInvalidError' });
  });

  it('throws ServiceNotFoundError when a serviceId does not belong to tenant', async () => {
    const unknownId = '00000000-0000-7000-8000-000000000099';

    await expect(
      useCase.execute({
        from: monday,
        to: monday,
        serviceIds: [unknownId],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
      }),
    ).rejects.toMatchObject({ name: 'ServiceNotFoundError' });
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
      tenantId: TENANT_ID,
      businessHours: settings.businessHours,
      slotGranularityMinutes: settings.booking.slotGranularityMinutes,
      serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
    });

    expect(result).toHaveLength(2);
    expect(result[0].available).toBe(false);
    expect(result[1].available).toBe(false);
  });

  describe('resourceId (M21 Cluster 1)', () => {
    it('throws ResourceNotFoundError when resourceId does not exist', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_ID).build();
      await serviceRepo.save(service);

      await expect(
        useCase.execute({
          from: monday,
          to: sunday,
          serviceIds: [service.id],
          resourceId: '00000000-0000-7000-8000-000000000099',
          tenantId: TENANT_ID,
          businessHours: settings.businessHours,
          slotGranularityMinutes: settings.booking.slotGranularityMinutes,
          serviceBufferMinutes: settings.booking.serviceBufferMinutes,
          maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
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
          from: monday,
          to: sunday,
          serviceIds: [service.id],
          resourceId: resource.id,
          tenantId: TENANT_ID,
          businessHours: settings.businessHours,
          slotGranularityMinutes: settings.booking.slotGranularityMinutes,
          serviceBufferMinutes: settings.booking.serviceBufferMinutes,
          maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
        }),
      ).rejects.toThrow(ResourceNotActiveError);
    });

    it('a resource-scoped full-day closure marks just that day unavailable for the resource, leaving the tenant-wide summary unaffected', async () => {
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
        from: monday,
        to: monday,
        serviceIds: [service.id],
        resourceId: resource.id,
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
      });
      const tenantWide = await useCase.execute({
        from: monday,
        to: monday,
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
      });

      expect(scoped[0].available).toBe(false);
      expect(tenantWide[0].available).toBe(true);
    });
  });

  // UC-058/059: a real resource-scoped service (no resourceId query param, at least one service
  // is not degenerate) goes through buildResourceScopedSummary()'s own intersect/union path,
  // distinct from the tenant-wide degenerate path every other test in this file exercises.
  describe('resource-scoped services (buildResourceScopedSummary)', () => {
    it('is available on a day when a matching active resource is free', async () => {
      const room = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(room);
      const service = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();
      await serviceRepo.save(service);

      const result = await useCase.execute({
        from: monday,
        to: monday,
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
      });

      expect(result[0].available).toBe(true);
      expect(result[0].slotCount).toBeGreaterThan(0);
    });

    it('is unavailable when no active resource of the required type exists', async () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
        ])
        .build();
      await serviceRepo.save(service);

      const result = await useCase.execute({
        from: monday,
        to: monday,
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
      });

      expect(result[0].available).toBe(false);
      expect(result[0].slotCount).toBe(0);
    });

    it('marks a past date as available:false without querying any resource-scoped dependency', async () => {
      const room = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(room);
      const service = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();
      await serviceRepo.save(service);

      const result = await useCase.execute({
        from: '2020-01-01',
        to: '2020-01-01',
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
        maxBookingAdvanceDays: settings.booking.maxBookingAdvanceDays,
      });

      expect(result[0].available).toBe(false);
      expect(result[0].slotCount).toBe(0);
    });
  });
});
