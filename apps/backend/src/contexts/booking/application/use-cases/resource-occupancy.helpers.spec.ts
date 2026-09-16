import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { AvailabilityService } from '../../domain/services/availability.service';
import { BookingServiceNotInTenantError } from '../../domain/errors/booking-domain.error';
import { BookingServiceResourceTypeUnavailableError } from '../../domain/errors/booking-domain.error';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { ServiceLeg } from '../../domain/service-leg';
import { resolveBookingLinesResourceCandidates } from './resource-occupancy.helpers';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const SCHEDULED_AT = new Date('2026-06-01T10:00:00.000Z');

function leg(
  legIndex: number,
  requirement: ResourceRequirement,
  overrides: { durationMinutes?: number; transitionGapAfterMinutes?: number } = {},
): ServiceLeg {
  return ServiceLeg.create({
    legIndex,
    name: `Etapa ${legIndex}`,
    durationMinutes: overrides.durationMinutes ?? 20,
    resourceRequirements: [requirement],
    transitionGapAfterMinutes: overrides.transitionGapAfterMinutes ?? 0,
  });
}

describe('resolveBookingLinesResourceCandidates', () => {
  let resourceRepo: InMemoryResourceRepository;
  let availabilityService: AvailabilityService;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
    availabilityService = new AvailabilityService();
  });

  it('throws BookingServiceNotInTenantError when the line references a service missing from serviceMap', async () => {
    await expect(
      resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'missing-service', durationMinsAtBooking: 30 }],
        new Map(),
      ),
    ).rejects.toBeInstanceOf(BookingServiceNotInTenantError);
  });

  describe('flat (non-legged) services', () => {
    it('falls back to the degenerate LOCATION requirement when resourceRequirements is empty', async () => {
      const location = await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.LOCATION).build(),
      );
      const locationResource = (
        await resourceRepo.findByTenant(TENANT_ID, {
          type: ResourceType.LOCATION,
        })
      )[0];
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([])
        .build();

      const result = await resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      );

      const resolved = result.get('line-1')!;
      expect(resolved.isDegenerate).toBe(true);
      expect(resolved.candidates).toHaveLength(1);
      expect(resolved.candidates[0].resourceId).toBe(locationResource.id);
      void location;
    });

    it('resolves a real resource-scoped requirement and is not degenerate', async () => {
      const room = await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build(),
      );
      const roomResource = (
        await resourceRepo.findByTenant(TENANT_ID, { type: ResourceType.ROOM })
      )[0];
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();

      const result = await resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      );

      const resolved = result.get('line-1')!;
      expect(resolved.isDegenerate).toBe(false);
      expect(resolved.candidates[0].resourceId).toBe(roomResource.id);
      void room;
    });

    it('assigns a quantityPosition per member of a fungible pool with requiredQuantity > 1', async () => {
      await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.EQUIPMENT).build(),
      );
      await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.EQUIPMENT).build(),
      );
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.EQUIPMENT,
            selectionMode: 'AUTO_ANY',
            requiredQuantity: 2,
          }),
        ])
        .build();

      const result = await resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      );

      const candidates = result.get('line-1')!.candidates;
      expect(candidates.map((c) => c.quantityPosition).sort()).toEqual([0, 1]);
    });

    it('resolves a resourcePoolIds-restricted requirement without querying findByTenant', async () => {
      const pooled = await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build(),
      );
      const poolResource = (
        await resourceRepo.findByTenant(TENANT_ID, { type: ResourceType.ROOM })
      )[0];
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'CUSTOMER_CHOICE',
            resourcePoolIds: [poolResource.id],
          }),
        ])
        .build();

      const result = await resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      );

      expect(result.get('line-1')!.candidates[0].resourceId).toBe(poolResource.id);
      void pooled;
    });

    it('throws BookingServiceResourceTypeUnavailableError when no active resource of the requirement type exists', async () => {
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();

      await expect(
        resolveBookingLinesResourceCandidates(
          resourceRepo,
          availabilityService,
          TENANT_ID,
          SCHEDULED_AT,
          [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
          new Map([['service-1', service]]),
        ),
      ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
    });

    it('throws BookingServiceResourceTypeUnavailableError when a fixed pool has fewer members than requiredQuantity', async () => {
      const pooled = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(pooled);
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'CUSTOMER_CHOICE',
            resourcePoolIds: [pooled.id],
            requiredQuantity: 2,
          }),
        ])
        .build();

      await expect(
        resolveBookingLinesResourceCandidates(
          resourceRepo,
          availabilityService,
          TENANT_ID,
          SCHEDULED_AT,
          [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
          new Map([['service-1', service]]),
        ),
      ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
    });

    it('applies the buffer/turnover gap only on the last of several sequential lines', async () => {
      await resourceRepo.save(
        new ResourceBuilder()
          .withTenantId(TENANT_ID)
          .withType(ResourceType.ROOM)
          .withTurnoverMinutes(5)
          .build(),
      );
      const requirement = ResourceRequirement.create({
        type: ResourceType.ROOM,
        selectionMode: 'AUTO_ANY',
      });
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withBufferAfterMinutes(10)
        .withResourceRequirements([requirement])
        .build();

      const result = await resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [
          { lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 },
          { lineId: 'line-2', serviceId: 'service-1', durationMinsAtBooking: 30 },
        ],
        new Map([['service-1', service]]),
      );

      const firstEnd = result.get('line-1')!.candidates[0].endsAt;
      const secondStart = result.get('line-2')!.candidates[0].startsAt;
      const secondEnd = result.get('line-2')!.candidates[0].endsAt;
      // First line: no gap applied (not the last line) — ends exactly at +30min.
      expect(firstEnd).toEqual(new Date(SCHEDULED_AT.getTime() + 30 * 60_000));
      // Second line starts immediately where the first ended (back-to-back, no gap between lines).
      expect(secondStart).toEqual(firstEnd);
      // Last line: max(buffer 10, turnover 5) = 10min gap applied at the very end.
      expect(secondEnd).toEqual(new Date(secondStart.getTime() + (30 + 10) * 60_000));
    });
  });

  describe('legged services', () => {
    it('resolves one candidate per leg requirement, sequenced by computeLegSpans', async () => {
      await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build(),
      );
      const roomResource = (
        await resourceRepo.findByTenant(TENANT_ID, { type: ResourceType.ROOM })
      )[0];
      await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.EQUIPMENT).build(),
      );
      const equipmentResource = (
        await resourceRepo.findByTenant(TENANT_ID, { type: ResourceType.EQUIPMENT })
      )[0];

      const service = new ServiceBuilder()
        .withId('service-1')
        .withLegs([
          leg(
            0,
            ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
            {
              durationMinutes: 20,
            },
          ),
          leg(
            1,
            ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
            { durationMinutes: 15 },
          ),
        ])
        .build();

      const result = await resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 35 }],
        new Map([['service-1', service]]),
      );

      const candidates = result.get('line-1')!.candidates;
      expect(candidates).toHaveLength(2);
      const legZero = candidates.find((c) => c.legIndex === 0)!;
      const legOne = candidates.find((c) => c.legIndex === 1)!;
      expect(legZero.resourceId).toBe(roomResource.id);
      expect(legOne.resourceId).toBe(equipmentResource.id);
      expect(legZero.startsAt).toEqual(SCHEDULED_AT);
      expect(legOne.startsAt.getTime()).toBeGreaterThanOrEqual(legZero.startsAt.getTime());
    });

    it('is never degenerate, even with a single LOCATION-only leg requirement', async () => {
      await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.LOCATION).build(),
      );
      const service = new ServiceBuilder()
        .withId('service-1')
        .withLegs([
          leg(
            0,
            ResourceRequirement.create({ type: ResourceType.LOCATION, selectionMode: 'NONE' }),
          ),
        ])
        .build();

      const result = await resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 20 }],
        new Map([['service-1', service]]),
      );

      expect(result.get('line-1')!.isDegenerate).toBe(false);
    });

    it("picks the resource with the highest turnoverMinutes among a leg's own resources for that leg's gap", async () => {
      await resourceRepo.save(
        new ResourceBuilder()
          .withTenantId(TENANT_ID)
          .withType(ResourceType.ROOM)
          .withTurnoverMinutes(10)
          .build(),
      );
      const service = new ServiceBuilder()
        .withId('service-1')
        .withLegs([
          leg(
            0,
            ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
            {
              durationMinutes: 20,
              transitionGapAfterMinutes: 5,
            },
          ),
        ])
        .build();

      const result = await resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 20 }],
        new Map([['service-1', service]]),
      );

      const candidate = result.get('line-1')!.candidates[0];
      // endsAtWithTurnover includes the leg's own duration + the larger of transitionGap/turnover.
      expect(candidate.endsAt.getTime()).toBeGreaterThan(
        candidate.startsAt.getTime() + 20 * 60_000,
      );
    });
  });

  it('caches a resolved resource across repeated lookups within the same resolution call', async () => {
    const shared = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await resourceRepo.save(shared);
    const findByIdSpy = jest.spyOn(resourceRepo, 'findById');
    const service = new ServiceBuilder()
      .withId('service-1')
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: [shared.id],
        }),
      ])
      .build();

    await resolveBookingLinesResourceCandidates(
      resourceRepo,
      availabilityService,
      TENANT_ID,
      SCHEDULED_AT,
      [
        { lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 },
        { lineId: 'line-2', serviceId: 'service-1', durationMinsAtBooking: 30 },
      ],
      new Map([['service-1', service]] as [string, Service][]),
    );

    expect(findByIdSpy).toHaveBeenCalledTimes(1);
  });

  it('throws BookingServiceResourceTypeUnavailableError when a resourcePoolIds member no longer exists', async () => {
    const service = new ServiceBuilder()
      .withId('service-1')
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: ['00000000-0000-7000-8000-000000009999'],
        }),
      ])
      .build();

    await expect(
      resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      ),
    ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
  });

  it('throws BookingServiceResourceTypeUnavailableError when a resourcePoolIds member has been deactivated', async () => {
    const deactivated = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    deactivated.deactivate();
    await resourceRepo.save(deactivated);
    const service = new ServiceBuilder()
      .withId('service-1')
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: [deactivated.id],
        }),
      ])
      .build();

    await expect(
      resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      ),
    ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
  });

  it('throws BookingServiceResourceTypeUnavailableError when a resourcePoolIds member has since had its type changed away from the requirement', async () => {
    const retyped = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.EQUIPMENT)
      .build();
    await resourceRepo.save(retyped);
    const service = new ServiceBuilder()
      .withId('service-1')
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: [retyped.id],
        }),
      ])
      .build();

    await expect(
      resolveBookingLinesResourceCandidates(
        resourceRepo,
        availabilityService,
        TENANT_ID,
        SCHEDULED_AT,
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      ),
    ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
  });
});
