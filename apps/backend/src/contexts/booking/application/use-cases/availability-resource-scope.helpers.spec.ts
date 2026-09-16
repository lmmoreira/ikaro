import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import {
  isDegenerateService,
  resolveAvailabilityRequirementEntries,
} from './availability-resource-scope.helpers';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('isDegenerateService', () => {
  it('is degenerate when resourceRequirements is empty and there are no legs', () => {
    const service = new ServiceBuilder().withResourceRequirements([]).build();
    expect(isDegenerateService(service)).toBe(true);
  });

  it('is degenerate for the exact single LOCATION/no-pool requirement shape', () => {
    const service = new ServiceBuilder()
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.LOCATION, selectionMode: 'NONE' }),
      ])
      .build();
    expect(isDegenerateService(service)).toBe(true);
  });

  it('is not degenerate when the single LOCATION requirement has a resourcePoolIds restriction', () => {
    const service = new ServiceBuilder()
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.LOCATION,
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: ['loc-1'],
        }),
      ])
      .build();
    expect(isDegenerateService(service)).toBe(false);
  });

  it('is not degenerate for a single non-LOCATION requirement', () => {
    const service = new ServiceBuilder()
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .build();
    expect(isDegenerateService(service)).toBe(false);
  });

  it('is not degenerate for a bundle of more than one requirement', () => {
    const service = new ServiceBuilder()
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.LOCATION, selectionMode: 'NONE' }),
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .build();
    expect(isDegenerateService(service)).toBe(false);
  });

  it('is not degenerate for a legged service, regardless of leg requirements', () => {
    const service = new ServiceBuilder()
      .withLegs([
        ServiceLeg.create({
          legIndex: 0,
          name: 'Etapa 1',
          durationMinutes: 20,
          resourceRequirements: [
            ResourceRequirement.create({ type: ResourceType.LOCATION, selectionMode: 'NONE' }),
          ],
          transitionGapAfterMinutes: 0,
        }),
      ])
      .build();
    expect(isDegenerateService(service)).toBe(false);
  });
});

describe('resolveAvailabilityRequirementEntries', () => {
  let resourceRepo: InMemoryResourceRepository;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
  });

  it('resolves candidateResourceIds from resourcePoolIds when set, without querying findByTenant', async () => {
    const service = new ServiceBuilder()
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'CUSTOMER_CHOICE',
          resourcePoolIds: ['room-1', 'room-2'],
        }),
      ])
      .build();
    const findByTenantSpy = jest.spyOn(resourceRepo, 'findByTenant');

    const entries = await resolveAvailabilityRequirementEntries(service, resourceRepo, TENANT_ID);

    expect(entries).toEqual([{ candidateResourceIds: ['room-1', 'room-2'] }]);
    expect(findByTenantSpy).not.toHaveBeenCalled();
  });

  it('falls back to every active resource of the type when resourcePoolIds is unset', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);
    const service = new ServiceBuilder()
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementEntries(service, resourceRepo, TENANT_ID);

    expect(entries).toEqual([{ candidateResourceIds: [room.id] }]);
  });

  it('flattens every leg requirement into one entry list for a legged service', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_ID).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);
    const service = new ServiceBuilder()
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
              selectionMode: 'CUSTOMER_CHOICE',
              resourcePoolIds: ['equip-1'],
            }),
          ],
          transitionGapAfterMinutes: 0,
        }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementEntries(service, resourceRepo, TENANT_ID);

    expect(entries).toEqual([
      { candidateResourceIds: [room.id] },
      { candidateResourceIds: ['equip-1'] },
    ]);
  });

  it('resolves to an empty candidate list when no active resource of the type exists', async () => {
    const service = new ServiceBuilder()
      .withResourceRequirements([
        ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
      ])
      .build();

    const entries = await resolveAvailabilityRequirementEntries(service, resourceRepo, TENANT_ID);

    expect(entries).toEqual([{ candidateResourceIds: [] }]);
  });
});
