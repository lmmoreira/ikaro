import { ResourceType } from '../../domain/resource.types';
import {
  groupResourceAssignmentsByBookingId,
  ResourceAssignmentRow,
} from './typeorm-booking-resource-assignments.helpers';

function makeRow(overrides: Partial<ResourceAssignmentRow> = {}): ResourceAssignmentRow {
  return {
    bookingId: 'booking-1',
    resourceId: 'res-camila',
    resourceType: ResourceType.STAFF,
    resourceName: 'Camila Duarte',
    ...overrides,
  };
}

describe('groupResourceAssignmentsByBookingId', () => {
  it('returns an empty map for no rows', () => {
    expect(groupResourceAssignmentsByBookingId([])).toEqual(new Map());
  });

  it('groups multiple resources for the same booking', () => {
    const result = groupResourceAssignmentsByBookingId([
      makeRow({ resourceId: 'res-camila', resourceName: 'Camila Duarte' }),
      makeRow({
        resourceId: 'res-sala-1',
        resourceType: ResourceType.ROOM,
        resourceName: 'Sala 1',
      }),
    ]);

    expect(result.get('booking-1')).toEqual([
      { resourceId: 'res-camila', resourceType: ResourceType.STAFF, resourceName: 'Camila Duarte' },
      { resourceId: 'res-sala-1', resourceType: ResourceType.ROOM, resourceName: 'Sala 1' },
    ]);
  });

  it('keeps separate bookings in separate map entries', () => {
    const result = groupResourceAssignmentsByBookingId([
      makeRow({ bookingId: 'booking-1' }),
      makeRow({ bookingId: 'booking-2', resourceId: 'res-sala-1', resourceName: 'Sala 1' }),
    ]);

    expect(result.get('booking-1')).toHaveLength(1);
    expect(result.get('booking-2')).toHaveLength(1);
  });

  it('deduplicates the same resource assigned across multiple lines/legs of one booking', () => {
    const result = groupResourceAssignmentsByBookingId([
      makeRow({ resourceId: 'res-camila' }),
      makeRow({ resourceId: 'res-camila' }),
    ]);

    expect(result.get('booking-1')).toEqual([
      { resourceId: 'res-camila', resourceType: ResourceType.STAFF, resourceName: 'Camila Duarte' },
    ]);
  });
});
