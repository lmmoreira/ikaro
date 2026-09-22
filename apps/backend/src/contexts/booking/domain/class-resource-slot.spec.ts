import { ClassResourceSlot } from './class-resource-slot';
import { ClassResourceSlotEmptyPoolError } from './errors/booking-domain.error';
import { ResourceType } from './resource.types';

describe('ClassResourceSlot', () => {
  describe('create()', () => {
    it('creates with the given type and eligibleResourceIds', () => {
      const slot = ClassResourceSlot.create({
        type: ResourceType.ROOM,
        eligibleResourceIds: ['r-1', 'r-2'],
      });
      expect(slot.type).toBe(ResourceType.ROOM);
      expect(slot.eligibleResourceIds).toEqual(['r-1', 'r-2']);
    });

    it('throws ClassResourceSlotEmptyPoolError when eligibleResourceIds is empty', () => {
      expect(() =>
        ClassResourceSlot.create({ type: ResourceType.ROOM, eligibleResourceIds: [] }),
      ).toThrow(ClassResourceSlotEmptyPoolError);
    });
  });

  describe('reconstitute()', () => {
    it('reconstructs a slot with the given fields', () => {
      const slot = ClassResourceSlot.reconstitute({
        type: ResourceType.STAFF,
        eligibleResourceIds: ['r-1'],
      });
      expect(slot.type).toBe(ResourceType.STAFF);
      expect(slot.eligibleResourceIds).toEqual(['r-1']);
    });
  });

  describe('toJSON()', () => {
    it('returns a plain serializable object', () => {
      const slot = ClassResourceSlot.create({
        type: ResourceType.ROOM,
        eligibleResourceIds: ['r-1'],
      });
      expect(slot.toJSON()).toEqual({
        type: ResourceType.ROOM,
        eligibleResourceIds: ['r-1'],
      });
    });
  });
});
