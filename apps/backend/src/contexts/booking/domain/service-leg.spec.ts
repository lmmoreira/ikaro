import { ServiceLegInvalidError } from './errors/booking-domain.error';
import { ResourceRequirement } from './resource-requirement';
import { ResourceType } from './resource.types';
import { ServiceLeg } from './service-leg';

const REQUIREMENT = ResourceRequirement.create({
  type: ResourceType.ROOM,
  selectionMode: 'AUTO_ANY',
});

describe('ServiceLeg', () => {
  describe('create()', () => {
    it('creates with the given fields, defaulting transitionGapAfterMinutes to 0', () => {
      const leg = ServiceLeg.create({
        legIndex: 0,
        name: 'Sauna',
        durationMinutes: 20,
        resourceRequirements: [REQUIREMENT],
      });
      expect(leg.legIndex).toBe(0);
      expect(leg.name).toBe('Sauna');
      expect(leg.durationMinutes).toBe(20);
      expect(leg.transitionGapAfterMinutes).toBe(0);
      expect(leg.resourceRequirements).toHaveLength(1);
    });

    it('throws when durationMinutes is zero or negative', () => {
      expect(() =>
        ServiceLeg.create({
          legIndex: 0,
          name: 'Sauna',
          durationMinutes: 0,
          resourceRequirements: [REQUIREMENT],
        }),
      ).toThrow(ServiceLegInvalidError);
    });

    it('throws when resourceRequirements is empty', () => {
      expect(() =>
        ServiceLeg.create({
          legIndex: 0,
          name: 'Sauna',
          durationMinutes: 20,
          resourceRequirements: [],
        }),
      ).toThrow(ServiceLegInvalidError);
    });
  });

  describe('reconstitute()', () => {
    it('reconstructs a leg with its nested resource requirements', () => {
      const leg = ServiceLeg.reconstitute({
        legIndex: 1,
        name: 'Massagem',
        durationMinutes: 50,
        transitionGapAfterMinutes: 5,
        resourceRequirements: [REQUIREMENT.toJSON()],
      });
      expect(leg.resourceRequirements).toHaveLength(1);
      expect(leg.resourceRequirements[0].type).toBe(ResourceType.ROOM);
    });
  });

  describe('toJSON()', () => {
    it('serializes the leg and its nested requirements', () => {
      const leg = ServiceLeg.create({
        legIndex: 0,
        name: 'Sauna',
        durationMinutes: 20,
        resourceRequirements: [REQUIREMENT],
        transitionGapAfterMinutes: 10,
      });
      expect(leg.toJSON()).toEqual({
        legIndex: 0,
        name: 'Sauna',
        durationMinutes: 20,
        transitionGapAfterMinutes: 10,
        resourceRequirements: [REQUIREMENT.toJSON()],
      });
    });
  });
});
