import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  BookingResourceSelectionRequiredError,
  BookingServiceNotInTenantError,
} from '../../domain/errors/booking-domain.error';
import { BookingServiceResourceTypeUnavailableError } from '../../domain/errors/booking-domain.error';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { ServiceLeg } from '../../domain/service-leg';
import {
  resolveBookingLinesResourceCandidates,
  ResourceSelectionInput,
} from './resource-occupancy.helpers';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000099';
const TIMEZONE = 'America/Sao_Paulo';
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
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let availabilityService: AvailabilityService;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    availabilityService = new AvailabilityService();
  });

  async function resolve(
    lines: { lineId: string; serviceId: string; durationMinsAtBooking: number }[],
    serviceMap: Map<string, Service>,
    resourceSelections: ResourceSelectionInput[] = [],
    scheduledAt: Date = SCHEDULED_AT,
  ) {
    return resolveBookingLinesResourceCandidates({
      resourceRepo,
      availabilityService,
      occupancyRepo,
      tenantId: TENANT_ID,
      scheduledAt,
      timezone: TIMEZONE,
      lines,
      serviceMap,
      resourceSelections,
    });
  }

  it('throws BookingServiceNotInTenantError when the line references a service missing from serviceMap', async () => {
    await expect(
      resolve(
        [{ lineId: 'line-1', serviceId: 'missing-service', durationMinsAtBooking: 30 }],
        new Map(),
      ),
    ).rejects.toBeInstanceOf(BookingServiceNotInTenantError);
  });

  describe('flat (non-legged) services', () => {
    it('falls back to the degenerate LOCATION requirement when resourceRequirements is empty', async () => {
      const location = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.LOCATION)
        .build();
      await resourceRepo.save(location);
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

      const result = await resolve(
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
      const room = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(room);
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

      const result = await resolve(
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

      const result = await resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      );

      const candidates = result.get('line-1')!.candidates;
      expect(candidates.map((c) => c.quantityPosition).sort()).toEqual([0, 1]);
    });

    it('resolves a resourcePoolIds-restricted requirement without querying findByTenant', async () => {
      const pooled = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(pooled);
      const poolResource = (
        await resourceRepo.findByTenant(TENANT_ID, { type: ResourceType.ROOM })
      )[0];
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'AUTO_ANY',
            resourcePoolIds: [poolResource.id],
          }),
        ])
        .build();

      const result = await resolve(
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
        resolve(
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
            selectionMode: 'AUTO_ANY',
            resourcePoolIds: [pooled.id],
            requiredQuantity: 2,
          }),
        ])
        .build();

      await expect(
        resolve(
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

      const result = await resolve(
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

      const result = await resolve(
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

      const result = await resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 20 }],
        new Map([['service-1', service]]),
      );

      expect(result.get('line-1')!.isDegenerate).toBe(false);
    });

    it("applies that leg's own resource's turnoverMinutes to its endsAt", async () => {
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

      const result = await resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 20 }],
        new Map([['service-1', service]]),
      );

      const candidate = result.get('line-1')!.candidates[0];
      expect(candidate.endsAt.getTime()).toBe(candidate.startsAt.getTime() + (20 + 10) * 60_000);
    });

    it("gives each of a leg's fungible-pool candidates its own turnover, not the pool's maximum", async () => {
      const lowTurnover = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .withTurnoverMinutes(0)
        .build();
      const highTurnover = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .withTurnoverMinutes(60)
        .build();
      await resourceRepo.save(lowTurnover);
      await resourceRepo.save(highTurnover);
      const service = new ServiceBuilder()
        .withId('service-1')
        .withLegs([
          leg(
            0,
            ResourceRequirement.create({
              type: ResourceType.ROOM,
              selectionMode: 'AUTO_ANY',
              resourcePoolIds: [lowTurnover.id, highTurnover.id],
              requiredQuantity: 2,
            }),
            { durationMinutes: 20, transitionGapAfterMinutes: 0 },
          ),
        ])
        .build();

      const result = await resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 20 }],
        new Map([['service-1', service]]),
      );

      const candidates = result.get('line-1')!.candidates;
      const lowCandidate = candidates.find((c) => c.resourceId === lowTurnover.id)!;
      const highCandidate = candidates.find((c) => c.resourceId === highTurnover.id)!;
      // Neither candidate is forced onto the pool-wide max (60min) — each keeps its own gap.
      expect(lowCandidate.endsAt.getTime()).toBe(lowCandidate.startsAt.getTime() + 20 * 60_000);
      expect(highCandidate.endsAt.getTime()).toBe(
        highCandidate.startsAt.getTime() + (20 + 60) * 60_000,
      );
    });
  });

  describe('CUSTOMER_CHOICE (M23-S01)', () => {
    it('uses the matching resourceSelections entry for a flat requirement', async () => {
      const chosen = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(chosen);
      await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build(),
      );
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'CUSTOMER_CHOICE',
          }),
        ])
        .build();

      const result = await resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
        [
          {
            serviceId: 'service-1',
            legIndex: null,
            resourceType: ResourceType.ROOM,
            resourceId: chosen.id,
          },
        ],
      );

      expect(result.get('line-1')!.candidates[0].resourceId).toBe(chosen.id);
    });

    it('throws BookingResourceSelectionRequiredError when no matching selection is provided', async () => {
      await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build(),
      );
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'CUSTOMER_CHOICE',
          }),
        ])
        .build();

      await expect(
        resolve(
          [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
          new Map([['service-1', service]]),
          [],
        ),
      ).rejects.toBeInstanceOf(BookingResourceSelectionRequiredError);
    });

    it('rejects a resourceSelections entry naming a resource outside the resourcePoolIds restriction', async () => {
      const inPool = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(inPool);
      const outsidePool = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(outsidePool);
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'CUSTOMER_CHOICE',
            resourcePoolIds: [inPool.id],
          }),
        ])
        .build();

      await expect(
        resolve(
          [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
          new Map([['service-1', service]]),
          [
            {
              serviceId: 'service-1',
              legIndex: null,
              resourceType: ResourceType.ROOM,
              resourceId: outsidePool.id,
            },
          ],
        ),
      ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
    });

    it("rejects a resourceSelections entry naming another tenant's resource", async () => {
      const otherTenantResource = new ResourceBuilder()
        .withTenantId(OTHER_TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(otherTenantResource);
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'CUSTOMER_CHOICE',
          }),
        ])
        .build();

      await expect(
        resolve(
          [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
          new Map([['service-1', service]]),
          [
            {
              serviceId: 'service-1',
              legIndex: null,
              resourceType: ResourceType.ROOM,
              resourceId: otherTenantResource.id,
            },
          ],
        ),
      ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
    });

    it('addresses a per-leg CUSTOMER_CHOICE selection by legIndex', async () => {
      const chosen = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(chosen);
      await resourceRepo.save(
        new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build(),
      );
      const service = new ServiceBuilder()
        .withId('service-1')
        .withLegs([
          leg(
            0,
            ResourceRequirement.create({
              type: ResourceType.ROOM,
              selectionMode: 'CUSTOMER_CHOICE',
            }),
          ),
        ])
        .build();

      const result = await resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 20 }],
        new Map([['service-1', service]]),
        [
          {
            serviceId: 'service-1',
            legIndex: 0,
            resourceType: ResourceType.ROOM,
            resourceId: chosen.id,
          },
        ],
      );

      expect(result.get('line-1')!.candidates[0].resourceId).toBe(chosen.id);
    });
  });

  describe('AUTO_ANY least-workload tie-break (UC-063 A1, M23-S01)', () => {
    it('picks the resource with the fewest active occupancy rows on the tenant-local day', async () => {
      const busy = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(busy);
      const free = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(free);
      await occupancyRepo.assign(
        TENANT_ID,
        'other-line',
        [
          {
            resourceId: busy.id,
            resourceType: ResourceType.ROOM,
            resourceName: busy.name,
            legIndex: null,
            quantityPosition: null,
            startsAt: new Date('2026-06-01T08:00:00.000Z'),
            endsAt: new Date('2026-06-01T09:00:00.000Z'),
            selectionMode: 'AUTO_ANY',
            isBundleMember: false,
          },
        ],
        'COMMITTED',
        null,
      );
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();

      const result = await resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      );

      expect(result.get('line-1')!.candidates[0].resourceId).toBe(free.id);
    });

    it('falls back to resourceId ascending when workload is tied', async () => {
      const a = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
      await resourceRepo.save(a);
      const b = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
      await resourceRepo.save(b);
      const expected = [a.id, b.id].sort()[0];
      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();

      const result = await resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      );

      expect(result.get('line-1')!.candidates[0].resourceId).toBe(expected);
    });

    // UC-063 A1's tie-break ("least already-locked workload") only applies "among candidates
    // already free for the chosen slot" — it is not itself an availability check. A candidate
    // with lower total day-workload but a real conflict at the exact requested window must never
    // be preferred over a busier-overall candidate that's actually free at that window; otherwise
    // the booking would incorrectly 409 even though a genuinely free resource exists.
    it('prefers a resource that is actually free at the requested window over a lower-workload one that conflicts', async () => {
      const lowWorkloadButBusy = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      const higherWorkloadButFree = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await resourceRepo.save(lowWorkloadButBusy);
      await resourceRepo.save(higherWorkloadButFree);

      // Exactly one row, but it overlaps the requested window itself (day-workload count: 1).
      await occupancyRepo.assign(
        TENANT_ID,
        'other-line-1',
        [
          {
            resourceId: lowWorkloadButBusy.id,
            resourceType: ResourceType.ROOM,
            resourceName: lowWorkloadButBusy.name,
            legIndex: null,
            quantityPosition: null,
            startsAt: SCHEDULED_AT,
            endsAt: new Date(SCHEDULED_AT.getTime() + 30 * 60_000),
            selectionMode: 'AUTO_ANY',
            isBundleMember: false,
          },
        ],
        'COMMITTED',
        null,
      );
      // Two rows earlier the same day, well clear of the requested window (day-workload count: 2
      // — higher than the resource above — but genuinely free at the requested time).
      await occupancyRepo.assign(
        TENANT_ID,
        'other-line-2',
        [
          {
            resourceId: higherWorkloadButFree.id,
            resourceType: ResourceType.ROOM,
            resourceName: higherWorkloadButFree.name,
            legIndex: null,
            quantityPosition: null,
            startsAt: new Date('2026-06-01T08:00:00.000Z'),
            endsAt: new Date('2026-06-01T08:30:00.000Z'),
            selectionMode: 'AUTO_ANY',
            isBundleMember: false,
          },
          {
            resourceId: higherWorkloadButFree.id,
            resourceType: ResourceType.ROOM,
            resourceName: higherWorkloadButFree.name,
            legIndex: null,
            quantityPosition: null,
            startsAt: new Date('2026-06-01T08:30:00.000Z'),
            endsAt: new Date('2026-06-01T09:00:00.000Z'),
            selectionMode: 'AUTO_ANY',
            isBundleMember: false,
          },
        ],
        'COMMITTED',
        null,
      );

      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();

      const result = await resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      );

      expect(result.get('line-1')!.candidates[0].resourceId).toBe(higherWorkloadButFree.id);
    });

    // The pre-filter must check each candidate's own TRUE effective window (raw window + that
    // resource's own trailing buffer/turnover gap), not just the raw window — otherwise a
    // resource that's busy only during its own trailing gap still passes the pre-filter, gets
    // picked for its lower day-workload, and then fails the final assertSlotFree() check with a
    // 409 even though a genuinely (fully) free resource existed.
    it('excludes a resource whose only conflict falls in its own trailing turnover gap, even with lower day-workload', async () => {
      const lowWorkloadButBusyDuringGap = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .withTurnoverMinutes(15)
        .build();
      const higherWorkloadButFullyFree = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .withTurnoverMinutes(0)
        .build();
      await resourceRepo.save(lowWorkloadButBusyDuringGap);
      await resourceRepo.save(higherWorkloadButFullyFree);

      const rawLineEnd = new Date(SCHEDULED_AT.getTime() + 30 * 60_000);
      // Conflicts only in [rawLineEnd, rawLineEnd + 15min) — this resource's own trailing
      // turnover extension, not the raw [SCHEDULED_AT, rawLineEnd) window. Day-workload count: 1.
      await occupancyRepo.assign(
        TENANT_ID,
        'other-line-gap',
        [
          {
            resourceId: lowWorkloadButBusyDuringGap.id,
            resourceType: ResourceType.ROOM,
            resourceName: lowWorkloadButBusyDuringGap.name,
            legIndex: null,
            quantityPosition: null,
            startsAt: rawLineEnd,
            endsAt: new Date(rawLineEnd.getTime() + 15 * 60_000),
            selectionMode: 'AUTO_ANY',
            isBundleMember: false,
          },
        ],
        'COMMITTED',
        null,
      );
      // Two rows earlier the same day, well clear of the requested window (day-workload count: 2
      // — higher — but genuinely free, including its own zero-turnover trailing gap).
      await occupancyRepo.assign(
        TENANT_ID,
        'other-line-clear-1',
        [
          {
            resourceId: higherWorkloadButFullyFree.id,
            resourceType: ResourceType.ROOM,
            resourceName: higherWorkloadButFullyFree.name,
            legIndex: null,
            quantityPosition: null,
            startsAt: new Date('2026-06-01T08:00:00.000Z'),
            endsAt: new Date('2026-06-01T08:30:00.000Z'),
            selectionMode: 'AUTO_ANY',
            isBundleMember: false,
          },
          {
            resourceId: higherWorkloadButFullyFree.id,
            resourceType: ResourceType.ROOM,
            resourceName: higherWorkloadButFullyFree.name,
            legIndex: null,
            quantityPosition: null,
            startsAt: new Date('2026-06-01T08:30:00.000Z'),
            endsAt: new Date('2026-06-01T09:00:00.000Z'),
            selectionMode: 'AUTO_ANY',
            isBundleMember: false,
          },
        ],
        'COMMITTED',
        null,
      );

      const service = new ServiceBuilder()
        .withId('service-1')
        .withDurationMinutes(30)
        .withBufferAfterMinutes(0)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();

      const result = await resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      );

      expect(result.get('line-1')!.candidates[0].resourceId).toBe(higherWorkloadButFullyFree.id);
    });
  });

  it("loads a type's active resources at most once per resolution call, across repeated lines sharing that type", async () => {
    const shared = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await resourceRepo.save(shared);
    const findByTenantSpy = jest.spyOn(resourceRepo, 'findByTenant');
    const findByIdSpy = jest.spyOn(resourceRepo, 'findById');
    const service = new ServiceBuilder()
      .withId('service-1')
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'AUTO_ANY',
          resourcePoolIds: [shared.id],
        }),
      ])
      .build();

    await resolve(
      [
        { lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 },
        { lineId: 'line-2', serviceId: 'service-1', durationMinsAtBooking: 30 },
      ],
      new Map([['service-1', service]] as [string, Service][]),
    );

    // The eligibility load itself is a single bulk findByTenant() (never a per-candidate
    // findById()) — cached per type on the shared resolution context so the second line's
    // identical requirement reuses it instead of re-querying.
    expect(findByTenantSpy).toHaveBeenCalledTimes(1);
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('throws BookingServiceResourceTypeUnavailableError when a resourcePoolIds member no longer exists', async () => {
    const service = new ServiceBuilder()
      .withId('service-1')
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'AUTO_ANY',
          resourcePoolIds: ['00000000-0000-7000-8000-000000009999'],
        }),
      ])
      .build();

    await expect(
      resolve(
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
          selectionMode: 'AUTO_ANY',
          resourcePoolIds: [deactivated.id],
        }),
      ])
      .build();

    await expect(
      resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      ),
    ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
  });

  it('selects the active pool member instead of failing when another resourcePoolIds member has been deactivated', async () => {
    const first = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    const second = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    // Deactivate whichever one has the LOWER id — the tie-break's stable secondary sort
    // (resourceId ascending, both have 0 workload here) would otherwise pick it deterministically
    // regardless of uuidv7 generation order, so the test must not assume which resource that is.
    const [tieBreakWinner, tieBreakLoser] = [first, second].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    tieBreakWinner.deactivate();
    await resourceRepo.save(tieBreakWinner);
    await resourceRepo.save(tieBreakLoser);
    const service = new ServiceBuilder()
      .withId('service-1')
      .withDurationMinutes(30)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'AUTO_ANY',
          resourcePoolIds: [tieBreakWinner.id, tieBreakLoser.id],
        }),
      ])
      .build();

    const result = await resolve(
      [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
      new Map([['service-1', service]]),
    );

    expect(result.get('line-1')!.candidates[0].resourceId).toBe(tieBreakLoser.id);
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
          selectionMode: 'AUTO_ANY',
          resourcePoolIds: [retyped.id],
        }),
      ])
      .build();

    await expect(
      resolve(
        [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 30 }],
        new Map([['service-1', service]]),
      ),
    ).rejects.toBeInstanceOf(BookingServiceResourceTypeUnavailableError);
  });

  // Legged AUTO_ANY requirements get the identical exact-window availability pre-filter flat
  // requirements already get (a leg's own raw span is knowable from the service's static leg
  // definitions alone, before any resource is chosen — see resolveLeggedLineCandidates). Without
  // it, the least-workload-overall resource could be picked for a leg it's actually busy during,
  // even while a busier-overall resource sits genuinely free for that same leg.
  it('for a legged AUTO_ANY requirement, prefers a resource actually free for that leg over a lower-workload one that conflicts with it', async () => {
    const lowWorkloadButBusyForThisLeg = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    const higherWorkloadButFreeForThisLeg = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await resourceRepo.save(lowWorkloadButBusyForThisLeg);
    await resourceRepo.save(higherWorkloadButFreeForThisLeg);

    // Conflicts with this leg's own [SCHEDULED_AT, SCHEDULED_AT + 20min) window. Day-workload
    // count: 1.
    await occupancyRepo.assign(
      TENANT_ID,
      'other-line-leg-conflict',
      [
        {
          resourceId: lowWorkloadButBusyForThisLeg.id,
          resourceType: ResourceType.ROOM,
          resourceName: lowWorkloadButBusyForThisLeg.name,
          legIndex: null,
          quantityPosition: null,
          startsAt: SCHEDULED_AT,
          endsAt: new Date(SCHEDULED_AT.getTime() + 20 * 60_000),
          selectionMode: 'AUTO_ANY',
          isBundleMember: false,
        },
      ],
      'COMMITTED',
      null,
    );
    // Two rows earlier the same day, well clear of the leg's window (day-workload count: 2 —
    // higher — but genuinely free for this leg).
    await occupancyRepo.assign(
      TENANT_ID,
      'other-line-leg-clear-1',
      [
        {
          resourceId: higherWorkloadButFreeForThisLeg.id,
          resourceType: ResourceType.ROOM,
          resourceName: higherWorkloadButFreeForThisLeg.name,
          legIndex: null,
          quantityPosition: null,
          startsAt: new Date('2026-06-01T08:00:00.000Z'),
          endsAt: new Date('2026-06-01T08:30:00.000Z'),
          selectionMode: 'AUTO_ANY',
          isBundleMember: false,
        },
        {
          resourceId: higherWorkloadButFreeForThisLeg.id,
          resourceType: ResourceType.ROOM,
          resourceName: higherWorkloadButFreeForThisLeg.name,
          legIndex: null,
          quantityPosition: null,
          startsAt: new Date('2026-06-01T08:30:00.000Z'),
          endsAt: new Date('2026-06-01T09:00:00.000Z'),
          selectionMode: 'AUTO_ANY',
          isBundleMember: false,
        },
      ],
      'COMMITTED',
      null,
    );

    const service = new ServiceBuilder()
      .withId('service-1')
      .withLegs([
        leg(0, ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }), {
          durationMinutes: 20,
        }),
      ])
      .build();

    const result = await resolve(
      [{ lineId: 'line-1', serviceId: 'service-1', durationMinsAtBooking: 20 }],
      new Map([['service-1', service]]),
    );

    expect(result.get('line-1')!.candidates[0].resourceId).toBe(higherWorkloadButFreeForThisLeg.id);
  });
});
