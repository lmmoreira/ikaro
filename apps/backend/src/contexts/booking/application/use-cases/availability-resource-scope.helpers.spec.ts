import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import { isDegenerateService } from './availability-resource-scope.helpers';

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
