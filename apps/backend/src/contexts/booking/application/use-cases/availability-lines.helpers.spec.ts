import { ResourceBuilder, ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  BookingDurationOutOfRangeError,
  BookingInvalidMultipleVariableServicesError,
  BookingServiceResourceTypeUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import { BookingQuoteService } from '../services/booking-quote.service';
import { buildAvailabilityLines, toPlainAvailabilityLines } from './availability-lines.helpers';
import { ResourceSelectionInput } from './resource-occupancy.helpers';
import { selectionKey } from './resource-resolution-context.helpers';

const TENANT_A = '10000000-0000-4000-8000-0000000029d1';
const TENANT_B = '10000000-0000-4000-8000-0000000029d2';

const variablePolicy = {
  durationPolicy: 'CUSTOMER_SELECTED' as const,
  durationMinMinutes: 60,
  durationMaxMinutes: 240,
  durationIncrementMinutes: 60,
  pricingPolicy: 'FIXED' as const,
};

const choice = (type: ResourceType, resourcePoolIds: string[] | null = null) =>
  ResourceRequirement.create({ type, selectionMode: 'CUSTOMER_CHOICE', resourcePoolIds });

describe('availability-lines.helpers', () => {
  let resourceRepo: InMemoryResourceRepository;
  const quoteService = new BookingQuoteService();

  const seedStaff = async (tenantId = TENANT_A): Promise<Resource> => {
    const resource = new ResourceBuilder()
      .withTenantId(tenantId)
      .withType(ResourceType.STAFF)
      .withRefId(uuidv7())
      .build();
    await resourceRepo.save(resource);
    return resource;
  };

  const pick = (
    serviceId: string,
    resourceId: string,
    resourceType: ResourceType = ResourceType.STAFF,
    legIndex: number | null = null,
  ): ResourceSelectionInput => ({ serviceId, legIndex, resourceType, resourceId });

  const build = (
    services: Parameters<typeof buildAvailabilityLines>[2],
    overrides: Parameters<typeof buildAvailabilityLines>[3],
  ) => buildAvailabilityLines({ quoteService, resourceRepo }, TENANT_A, services, overrides);

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
  });

  describe('toPlainAvailabilityLines()', () => {
    it("maps each service to a line with the service's own duration and no pins", () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).withDurationMinutes(45).build();

      const [line] = toPlainAvailabilityLines([service]);

      expect(line.service).toBe(service);
      expect(line.durationMinutes).toBe(45);
      expect(line.pins.size).toBe(0);
    });
  });

  describe('buildAvailabilityLines() — no overrides', () => {
    it('returns plain lines without quoting or loading anything (byte-identical to before)', async () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withDurationMinutes(45)
        .withBookingPolicy(variablePolicy)
        .build();
      const quote = jest.spyOn(quoteService, 'quote');
      const findById = jest.spyOn(resourceRepo, 'findById');

      const [line] = await build([service], {});

      expect(line.durationMinutes).toBe(45);
      expect(line.pins.size).toBe(0);
      expect(quote).not.toHaveBeenCalled();
      expect(findById).not.toHaveBeenCalled();
    });

    it('treats an empty selection list like no selections', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).withDurationMinutes(45).build();

      const [line] = await build([service], { resourceSelections: [] });

      expect(line.durationMinutes).toBe(45);
    });
  });

  describe('buildAvailabilityLines() — duration', () => {
    it('uses the quoted duration of a CUSTOMER_SELECTED service', async () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withDurationMinutes(60)
        .withBookingPolicy(variablePolicy)
        .build();

      const [line] = await build([service], { durationMinutes: 180 });

      expect(line.durationMinutes).toBe(180);
    });

    it('leaves a FIXED service on its own duration whatever durationMinutes is sent', async () => {
      const service = new ServiceBuilder().withTenantId(TENANT_A).withDurationMinutes(45).build();

      const [line] = await build([service], { durationMinutes: 999 });

      expect(line.durationMinutes).toBe(45);
    });

    it.each([
      ['below the minimum', 30],
      ['above the maximum', 300],
      ['off the increment grid', 90],
      ['missing', undefined],
    ])('rejects a duration that is %s', async (_label, durationMinutes) => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withBookingPolicy(variablePolicy)
        .build();
      const staff = await seedStaff();
      const overrides =
        durationMinutes === undefined
          ? { resourceSelections: [pick('unused', staff.id)] }
          : { durationMinutes };

      await expect(build([service], overrides)).rejects.toBeInstanceOf(
        BookingDurationOutOfRangeError,
      );
    });

    it('rejects a duration when more than one CUSTOMER_SELECTED service is requested', async () => {
      const a = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withBookingPolicy(variablePolicy)
        .build();
      const b = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withBookingPolicy(variablePolicy)
        .build();

      await expect(build([a, b], { durationMinutes: 60 })).rejects.toBeInstanceOf(
        BookingInvalidMultipleVariableServicesError,
      );
    });

    it("validates a chosen duration for a legged service but keeps the legs' own length (booking creation does the same)", async () => {
      const legged = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withDurationMinutes(50)
        .withBookingPolicy(variablePolicy)
        .withLegs([
          ServiceLeg.create({
            legIndex: 0,
            name: 'Etapa 1',
            durationMinutes: 20,
            resourceRequirements: [choice(ResourceType.STAFF)],
          }),
          ServiceLeg.create({
            legIndex: 1,
            name: 'Etapa 2',
            durationMinutes: 30,
            resourceRequirements: [choice(ResourceType.STAFF)],
          }),
        ])
        .build();

      const [line] = await build([legged], { durationMinutes: 240 });

      expect(line.durationMinutes).toBe(50);
      await expect(build([legged], { durationMinutes: 300 })).rejects.toBeInstanceOf(
        BookingDurationOutOfRangeError,
      );
    });
  });

  describe('buildAvailabilityLines() — pinned selections', () => {
    it('pins a flat CUSTOMER_CHOICE pick under the same key the booking write path uses', async () => {
      const ana = await seedStaff();
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withResourceRequirements([choice(ResourceType.STAFF)])
        .build();

      const [line] = await build([service], { resourceSelections: [pick(service.id, ana.id)] });

      const key = selectionKey(service.id, null, ResourceType.STAFF);
      expect(line.pins.get(key)?.map((r) => r.id)).toEqual([ana.id]);
    });

    it("pins a legged pick to its own leg, never to another leg's requirement of the same type", async () => {
      const ana = await seedStaff();
      const legged = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withLegs([
          ServiceLeg.create({
            legIndex: 0,
            name: 'Avaliação',
            durationMinutes: 30,
            resourceRequirements: [choice(ResourceType.STAFF)],
          }),
          ServiceLeg.create({
            legIndex: 1,
            name: 'Procedimento',
            durationMinutes: 30,
            resourceRequirements: [choice(ResourceType.STAFF)],
          }),
        ])
        .build();

      const [line] = await build([legged], {
        resourceSelections: [pick(legged.id, ana.id, ResourceType.STAFF, 1)],
      });

      expect(line.pins.has(selectionKey(legged.id, 1, ResourceType.STAFF))).toBe(true);
      expect(line.pins.has(selectionKey(legged.id, 0, ResourceType.STAFF))).toBe(false);
    });

    it('keeps several distinct picks for one requirement and drops a repeated one', async () => {
      const ana = await seedStaff();
      const bia = await seedStaff();
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withResourceRequirements([choice(ResourceType.STAFF)])
        .build();

      const [line] = await build([service], {
        resourceSelections: [
          pick(service.id, ana.id),
          pick(service.id, bia.id),
          pick(service.id, ana.id),
        ],
      });

      const pinned = line.pins.get(selectionKey(service.id, null, ResourceType.STAFF)) ?? [];
      expect(pinned.map((r) => r.id)).toEqual([ana.id, bia.id]);
    });

    it('gives each requested service only its own pins', async () => {
      const ana = await seedStaff();
      const withChoice = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withResourceRequirements([choice(ResourceType.STAFF)])
        .build();
      const plain = new ServiceBuilder().withTenantId(TENANT_A).build();

      const lines = await build([withChoice, plain], {
        resourceSelections: [pick(withChoice.id, ana.id)],
      });

      expect(lines[0].pins.size).toBe(1);
      expect(lines[1].pins.size).toBe(0);
    });

    it('loads each distinct picked resource once', async () => {
      const ana = await seedStaff();
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withResourceRequirements([choice(ResourceType.STAFF)])
        .build();
      const findById = jest.spyOn(resourceRepo, 'findById');

      await build([service], {
        resourceSelections: [pick(service.id, ana.id), pick(service.id, ana.id)],
      });

      expect(findById).toHaveBeenCalledTimes(1);
    });

    describe('rejects with BookingServiceResourceTypeUnavailableError', () => {
      const expectRejected = async (
        services: Parameters<typeof buildAvailabilityLines>[2],
        selections: ResourceSelectionInput[],
      ) => {
        await expect(build(services, { resourceSelections: selections })).rejects.toBeInstanceOf(
          BookingServiceResourceTypeUnavailableError,
        );
      };

      it('a pick for a service that was not requested', async () => {
        const ana = await seedStaff();
        const service = new ServiceBuilder()
          .withTenantId(TENANT_A)
          .withResourceRequirements([choice(ResourceType.STAFF)])
          .build();

        await expectRejected([service], [pick(uuidv7(), ana.id)]);
      });

      it('a pick that matches no CUSTOMER_CHOICE requirement (automatic requirement)', async () => {
        const ana = await seedStaff();
        const service = new ServiceBuilder()
          .withTenantId(TENANT_A)
          .withResourceRequirements([
            ResourceRequirement.create({
              type: ResourceType.STAFF,
              selectionMode: 'AUTO_ANY',
            }),
          ])
          .build();

        await expectRejected([service], [pick(service.id, ana.id)]);
      });

      it('a pick addressed to a leg index the service does not have', async () => {
        const ana = await seedStaff();
        const service = new ServiceBuilder()
          .withTenantId(TENANT_A)
          .withResourceRequirements([choice(ResourceType.STAFF)])
          .build();

        await expectRejected([service], [pick(service.id, ana.id, ResourceType.STAFF, 3)]);
      });

      it('an unknown resource', async () => {
        const service = new ServiceBuilder()
          .withTenantId(TENANT_A)
          .withResourceRequirements([choice(ResourceType.STAFF)])
          .build();

        await expectRejected([service], [pick(service.id, uuidv7())]);
      });

      it('an inactive resource', async () => {
        const ana = await seedStaff();
        ana.deactivate();
        await resourceRepo.save(ana);
        const service = new ServiceBuilder()
          .withTenantId(TENANT_A)
          .withResourceRequirements([choice(ResourceType.STAFF)])
          .build();

        await expectRejected([service], [pick(service.id, ana.id)]);
      });

      it('a resource outside the requirement pool', async () => {
        const inPool = await seedStaff();
        const outside = await seedStaff();
        const service = new ServiceBuilder()
          .withTenantId(TENANT_A)
          .withResourceRequirements([choice(ResourceType.STAFF, [inPool.id])])
          .build();

        await expectRejected([service], [pick(service.id, outside.id)]);
      });

      it('a resource of the wrong type', async () => {
        const room = new ResourceBuilder()
          .withTenantId(TENANT_A)
          .withType(ResourceType.ROOM)
          .build();
        await resourceRepo.save(room);
        const service = new ServiceBuilder()
          .withTenantId(TENANT_A)
          .withResourceRequirements([choice(ResourceType.STAFF)])
          .build();

        await expectRejected([service], [pick(service.id, room.id, ResourceType.STAFF)]);
      });

      it("a resource of another tenant (tenant isolation) — even one inside the requirement's own pool", async () => {
        const foreign = await seedStaff(TENANT_B);
        const service = new ServiceBuilder()
          .withTenantId(TENANT_A)
          .withResourceRequirements([choice(ResourceType.STAFF, [foreign.id])])
          .build();

        await expectRejected([service], [pick(service.id, foreign.id)]);
      });
    });
  });
});
