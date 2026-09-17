import { addDays, nextWeekday } from '../../../../test/utils/date-helpers';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { AvailabilityService } from '../../domain/services/availability.service';
import type { BusinessHours } from '../../../../shared/value-objects/business-hours.vo';
import { calculateSlotsForDate } from './availability-summary.helpers';

const monday = nextWeekday(1);
const tuesday = addDays(monday, 1);

// Monday-only late window so its business-hour slots fall in UTC Tuesday's calendar date
// (America/Sao_Paulo is UTC-3, so local 21:00-23:00 Monday is UTC 00:00-02:00 Tuesday).
const LATE_MONDAY_HOURS: BusinessHours = {
  timezone: 'America/Sao_Paulo',
  monday: { open: '21:00', close: '23:00' },
  tuesday: null,
  wednesday: null,
  thursday: null,
  friday: null,
  saturday: null,
  sunday: null,
};

describe('calculateSlotsForDate', () => {
  it('attributes occupancy to the tenant-local calendar day, not the bare UTC date string', () => {
    const availabilityService = new AvailabilityService();
    const service = new ServiceBuilder().withDurationMinutes(60).withBufferAfterMinutes(0).build();

    const slotsWithoutOccupancy = calculateSlotsForDate(availabilityService, monday, {
      services: [service],
      resource: null,
      closures: [],
      tenantOpenings: [],
      resourceOpenings: [],
      occupancy: [],
      businessHours: LATE_MONDAY_HOURS,
      slotGranularityMinutes: 60,
      serviceBufferMinutes: 0,
    });
    expect(slotsWithoutOccupancy.length).toBeGreaterThan(0);

    // This occupancy's UTC timestamps read as Tuesday, but it's really Monday 21:00-23:00 local —
    // the entire late window. A bare `${date}T00:00:00Z`/`T23:59:59.999Z` filter for "monday"
    // would exclude it (its startsAt is on/after Tuesday 00:00 UTC), wrongly reporting the window
    // as free.
    const slotsWithOccupancy = calculateSlotsForDate(availabilityService, monday, {
      services: [service],
      resource: null,
      closures: [],
      tenantOpenings: [],
      resourceOpenings: [],
      occupancy: [
        {
          resourceId: 'resource-1',
          startsAt: new Date(`${tuesday}T00:00:00.000Z`),
          endsAt: new Date(`${tuesday}T02:00:00.000Z`),
        },
      ],
      businessHours: LATE_MONDAY_HOURS,
      slotGranularityMinutes: 60,
      serviceBufferMinutes: 0,
    });
    expect(slotsWithOccupancy).toEqual([]);
  });
});
