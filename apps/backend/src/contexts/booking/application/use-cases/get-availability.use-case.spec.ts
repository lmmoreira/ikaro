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
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import { GetAvailabilityUseCase } from './get-availability.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const monday = nextWeekday(1);
const sunday = nextWeekday(0);
const saturday = nextWeekday(6); // 09:00-17:00 per buildDefaultBusinessHours — shorter than weekdays

describe('GetAvailabilityUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let closureRepo: InMemoryScheduleClosureRepository;
  let openingRepo: InMemoryScheduleOpeningRepository;
  let resourceRepo: InMemoryResourceRepository;
  let bookingPort: InMemoryBookingAvailabilityPort;
  let useCase: GetAvailabilityUseCase;
  let settings: TenantSettings;

  beforeEach(async () => {
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
    // M22-S03: the degenerate (tenant-wide) path now resolves the tenant's LOCATION resource
    // (M21-S02's real backfill guarantees one always exists in production) — every test in this
    // file implicitly relies on it existing unless it explicitly seeds its own resource(s).
    await resourceRepo.save(
      new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.LOCATION).build(),
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

  // UC-058: a real resource-scoped service (no resourceId query param, at least one service is
  // not degenerate) goes through calculateResourceScoped()'s own intersect/union path.
  describe('resource-scoped services (calculateResourceScoped)', () => {
    it('is available when a matching active resource is free', async () => {
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
        date: monday,
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      });

      expect(result.available).toBe(true);
      expect(result.slots.length).toBeGreaterThan(0);
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

    it('is unavailable when a bundle (2 requirements) has one requirement with no free candidate', async () => {
      const room = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(room);
      const service = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
          ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
        ])
        .build();
      await serviceRepo.save(service);

      const result = await useCase.execute({
        date: monday,
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      });

      expect(result.available).toBe(false);
    });

    it('checks each requested service against its own sequential window, not the combined duration of all lines (M22-S03 round-4 fix)', async () => {
      const room = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(room);
      const equipment = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.EQUIPMENT)
        .build();
      await resourceRepo.save(equipment);
      const serviceA = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();
      const serviceB = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
        ])
        .build();
      await serviceRepo.save(serviceA);
      await serviceRepo.save(serviceB);
      // Occupies EQUIPMENT for 09:00-09:30 local (America/Sao_Paulo, UTC-3) — the FIRST 30 minutes
      // of a hypothetical 09:00 start. serviceB (EQUIPMENT) only actually needs it for its own
      // sequential window, 09:30-10:00 (right after serviceA/ROOM's 09:00-09:30) — which does not
      // overlap this occupancy. A combined-duration check (the bug) would instead test EQUIPMENT
      // against the FULL 09:00-10:00 window and wrongly report 09:00 as unavailable.
      bookingPort.setSlots([
        {
          resourceId: equipment.id,
          startsAt: new Date(`${monday}T12:00:00.000Z`),
          endsAt: new Date(`${monday}T12:30:00.000Z`),
        },
      ]);

      const result = await useCase.execute({
        date: monday,
        serviceIds: [serviceA.id, serviceB.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      });

      expect(result.slots).toContainEqual(
        expect.objectContaining({ startsAt: new Date(`${monday}T12:00:00.000Z`).toISOString() }),
      );
    });

    it('applies per-leg turnover/transition-gap arithmetic in the read path, not one combined window (M22-S03 round-4 fix)', async () => {
      const room = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(room);
      const equipment = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.EQUIPMENT)
        .build();
      await resourceRepo.save(equipment);
      const legged = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withLegs([
          ServiceLeg.create({
            legIndex: 0,
            name: 'Etapa 1',
            durationMinutes: 20,
            resourceRequirements: [
              ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
            ],
            transitionGapAfterMinutes: 0,
          }),
          ServiceLeg.create({
            legIndex: 1,
            name: 'Etapa 2',
            durationMinutes: 15,
            resourceRequirements: [
              ResourceRequirement.create({
                type: ResourceType.EQUIPMENT,
                selectionMode: 'AUTO_ANY',
              }),
            ],
            transitionGapAfterMinutes: 0,
          }),
        ])
        .build();
      await serviceRepo.save(legged);
      // Occupies EQUIPMENT for 09:00-09:20 local — exactly leg 0's own window. Leg 1 (EQUIPMENT)
      // only needs it for 09:20-09:35 (right after leg 0), which doesn't overlap this occupancy. A
      // combined-duration check (the bug) would test EQUIPMENT against the full 09:00-09:35 window
      // and wrongly report 09:00 as unavailable.
      bookingPort.setSlots([
        {
          resourceId: equipment.id,
          startsAt: new Date(`${monday}T12:00:00.000Z`),
          endsAt: new Date(`${monday}T12:20:00.000Z`),
        },
      ]);

      const result = await useCase.execute({
        date: monday,
        serviceIds: [legged.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: settings.booking.slotGranularityMinutes,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      });

      expect(result.slots).toContainEqual(
        expect.objectContaining({ startsAt: new Date(`${monday}T12:00:00.000Z`).toISOString() }),
      );
    });

    it("uses the service's own buffer override for the outer fit-check, not the tenant default", async () => {
      const room = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(room);
      // Saturday closes at 17:00. Tenant default buffer is 60min (TenantSettings.default()), but
      // this service overrides its own buffer to 0 — the outer candidate generator must use the
      // service's own 0, not the tenant's 60, or the last bookable 16:30 start (30min duration +
      // 0min buffer fits exactly by 17:00) gets wrongly capped at 15:30 (30min + the tenant's 60).
      const service = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withDurationMinutes(30)
        .withBufferAfterMinutes(0)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();
      await serviceRepo.save(service);

      const result = await useCase.execute({
        date: saturday,
        serviceIds: [service.id],
        tenantId: TENANT_ID,
        businessHours: settings.businessHours,
        slotGranularityMinutes: 30,
        serviceBufferMinutes: settings.booking.serviceBufferMinutes,
      });

      expect(result.slots).toContainEqual(
        expect.objectContaining({
          startsAt: new Date(`${saturday}T19:30:00.000Z`).toISOString(),
        }),
      );
    });
  });
});
