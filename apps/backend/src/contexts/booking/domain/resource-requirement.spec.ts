import { ResourceRequirementInvalidError } from './errors/booking-domain.error';
import { ResourceRequirement } from './resource-requirement';
import { ResourceType } from './resource.types';

describe('ResourceRequirement', () => {
  describe('create()', () => {
    it('creates with defaults: requiredQuantity=1, resourcePoolIds=null', () => {
      const req = ResourceRequirement.create({
        type: ResourceType.STAFF,
        selectionMode: 'AUTO_ANY',
      });
      expect(req.type).toBe(ResourceType.STAFF);
      expect(req.selectionMode).toBe('AUTO_ANY');
      expect(req.requiredQuantity).toBe(1);
      expect(req.resourcePoolIds).toBeNull();
    });

    it('accepts an explicit resourcePoolIds restriction', () => {
      const req = ResourceRequirement.create({
        type: ResourceType.ROOM,
        selectionMode: 'CUSTOMER_CHOICE',
        resourcePoolIds: ['r1', 'r2'],
      });
      expect(req.resourcePoolIds).toEqual(['r1', 'r2']);
    });

    it('throws when requiredQuantity is zero or negative', () => {
      expect(() =>
        ResourceRequirement.create({
          type: ResourceType.STAFF,
          selectionMode: 'AUTO_ANY',
          requiredQuantity: 0,
        }),
      ).toThrow(ResourceRequirementInvalidError);
    });
  });

  describe('reconstitute()', () => {
    it('reconstructs without validation', () => {
      const req = ResourceRequirement.reconstitute({
        type: ResourceType.EQUIPMENT,
        selectionMode: 'NONE',
        resourcePoolIds: null,
        requiredQuantity: 1,
      });
      expect(req.type).toBe(ResourceType.EQUIPMENT);
    });
  });

  describe('toJSON()', () => {
    it('returns a plain serializable object', () => {
      const req = ResourceRequirement.create({
        type: ResourceType.STAFF,
        selectionMode: 'AUTO_ANY',
      });
      expect(req.toJSON()).toEqual({
        type: ResourceType.STAFF,
        selectionMode: 'AUTO_ANY',
        resourcePoolIds: null,
        requiredQuantity: 1,
      });
    });
  });
});
