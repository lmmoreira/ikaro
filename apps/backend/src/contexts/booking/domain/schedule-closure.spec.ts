import { futureDate, pastDate } from '../../../test/utils/date-helpers';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import { BookingDomainError } from './errors/booking-domain.error';
import { ClosureReason, ScheduleClosure } from './schedule-closure.aggregate';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';
const RESOURCE_ID = '00000000-0000-7000-8000-000000000003';

describe('ScheduleClosure.close() — full-day', () => {
  it('creates a full-day closure when no times provided', () => {
    const date = futureDate(5);
    const closure = ScheduleClosure.close({
      tenantId: TENANT_ID,
      date,
      reason: ClosureReason.HOLIDAY,
      createdBy: STAFF_ID,
    });

    expect(closure.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(closure.tenantId).toBe(TENANT_ID);
    expect(closure.resourceId).toBeNull();
    expect(closure.date).toBe(date);
    expect(closure.reason).toBe(ClosureReason.HOLIDAY);
    expect(closure.startTime).toBeNull();
    expect(closure.endTime).toBeNull();
    expect(closure.notes).toBeNull();
    expect(closure.createdBy).toBe(STAFF_ID);
    expect(closure.createdAt).toBeInstanceOf(Date);
    expect(closure.isFullDay()).toBe(true);
  });

  it('trims and stores optional notes', () => {
    const closure = ScheduleClosure.close({
      tenantId: TENANT_ID,
      date: futureDate(3),
      reason: ClosureReason.MAINTENANCE,
      createdBy: STAFF_ID,
      notes: '  Manutenção preventiva  ',
    });
    expect(closure.notes).toBe('Manutenção preventiva');
  });

  it('throws when date is in the past', () => {
    expect(() =>
      ScheduleClosure.close({
        tenantId: TENANT_ID,
        date: pastDate(1),
        reason: ClosureReason.HOLIDAY,
        createdBy: STAFF_ID,
      }),
    ).toThrow(BookingDomainError);
  });

  it('throws past date — correct error message', () => {
    expect(() =>
      ScheduleClosure.close({
        tenantId: TENANT_ID,
        date: pastDate(5),
        reason: ClosureReason.HOLIDAY,
        createdBy: STAFF_ID,
      }),
    ).toThrow('Cannot close a schedule for a past date');
  });

  it('allows closing today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const closure = ScheduleClosure.close({
      tenantId: TENANT_ID,
      date: today,
      reason: ClosureReason.STAFF_DAY_OFF,
      createdBy: STAFF_ID,
    });
    expect(closure.date).toBe(today);
  });

  it('throws when tenantId is empty', () => {
    expect(() =>
      ScheduleClosure.close({
        tenantId: '',
        date: futureDate(),
        reason: ClosureReason.HOLIDAY,
        createdBy: STAFF_ID,
      }),
    ).toThrow(BookingDomainError);
  });

  it('throws when createdBy is empty', () => {
    expect(() =>
      ScheduleClosure.close({
        tenantId: TENANT_ID,
        date: futureDate(),
        reason: ClosureReason.HOLIDAY,
        createdBy: '',
      }),
    ).toThrow(BookingDomainError);
  });

  it('throws when reason is not valid', () => {
    expect(() =>
      ScheduleClosure.close({
        tenantId: TENANT_ID,
        date: futureDate(),
        reason: 'INVALID_REASON' as ClosureReason,
        createdBy: STAFF_ID,
      }),
    ).toThrow(BookingDomainError);
  });

  it('accepts all valid ClosureReason values', () => {
    const date = futureDate(10);
    for (const reason of Object.values(ClosureReason)) {
      expect(() =>
        ScheduleClosure.close({ tenantId: TENANT_ID, date, reason, createdBy: STAFF_ID }),
      ).not.toThrow();
    }
  });
});

describe('ScheduleClosure.close() — partial-day', () => {
  it('creates a partial closure and returns TimeOfDay VOs for start/end', () => {
    const closure = ScheduleClosure.close({
      tenantId: TENANT_ID,
      date: futureDate(3),
      reason: ClosureReason.MAINTENANCE,
      createdBy: STAFF_ID,
      startTime: '10:00',
      endTime: '12:00',
    });
    expect(closure.startTime).toBeInstanceOf(TimeOfDay);
    expect(closure.startTime!.value).toBe('10:00');
    expect(closure.endTime).toBeInstanceOf(TimeOfDay);
    expect(closure.endTime!.value).toBe('12:00');
    expect(closure.isFullDay()).toBe(false);
  });

  it('throws when only startTime is provided without endTime', () => {
    expect(() =>
      ScheduleClosure.close({
        tenantId: TENANT_ID,
        date: futureDate(),
        reason: ClosureReason.MAINTENANCE,
        createdBy: STAFF_ID,
        startTime: '10:00',
      }),
    ).toThrow(BookingDomainError);
  });

  it('throws when only endTime is provided without startTime', () => {
    expect(() =>
      ScheduleClosure.close({
        tenantId: TENANT_ID,
        date: futureDate(),
        reason: ClosureReason.MAINTENANCE,
        createdBy: STAFF_ID,
        endTime: '12:00',
      }),
    ).toThrow(BookingDomainError);
  });

  it('throws when endTime is not after startTime', () => {
    expect(() =>
      ScheduleClosure.close({
        tenantId: TENANT_ID,
        date: futureDate(),
        reason: ClosureReason.MAINTENANCE,
        createdBy: STAFF_ID,
        startTime: '12:00',
        endTime: '10:00',
      }),
    ).toThrow(BookingDomainError);
  });

  it('throws when endTime equals startTime', () => {
    expect(() =>
      ScheduleClosure.close({
        tenantId: TENANT_ID,
        date: futureDate(),
        reason: ClosureReason.MAINTENANCE,
        createdBy: STAFF_ID,
        startTime: '10:00',
        endTime: '10:00',
      }),
    ).toThrow(BookingDomainError);
  });

  it('throws when startTime has invalid format', () => {
    expect(() =>
      ScheduleClosure.close({
        tenantId: TENANT_ID,
        date: futureDate(),
        reason: ClosureReason.MAINTENANCE,
        createdBy: STAFF_ID,
        startTime: '10',
        endTime: '12:00',
      }),
    ).toThrow(BookingDomainError);
  });
});

describe('ScheduleClosure.overlaps()', () => {
  const date = futureDate(5);

  it('full-day closure overlaps everything', () => {
    const fullDay = ScheduleClosure.close({
      tenantId: TENANT_ID,
      date,
      reason: ClosureReason.HOLIDAY,
      createdBy: STAFF_ID,
    });
    expect(fullDay.overlaps(null, null)).toBe(true);
    expect(fullDay.overlaps(TimeOfDay.create('10:00'), TimeOfDay.create('12:00'))).toBe(true);
  });

  it('partial closure overlaps a full-day request (null)', () => {
    const partial = ScheduleClosure.close({
      tenantId: TENANT_ID,
      date,
      reason: ClosureReason.MAINTENANCE,
      createdBy: STAFF_ID,
      startTime: '10:00',
      endTime: '12:00',
    });
    expect(partial.overlaps(null, null)).toBe(true);
  });

  it('partial closure overlaps intersecting window', () => {
    const partial = ScheduleClosure.close({
      tenantId: TENANT_ID,
      date,
      reason: ClosureReason.MAINTENANCE,
      createdBy: STAFF_ID,
      startTime: '10:00',
      endTime: '12:00',
    });
    expect(partial.overlaps(TimeOfDay.create('11:00'), TimeOfDay.create('13:00'))).toBe(true);
    expect(partial.overlaps(TimeOfDay.create('09:00'), TimeOfDay.create('11:00'))).toBe(true);
    expect(partial.overlaps(TimeOfDay.create('10:00'), TimeOfDay.create('12:00'))).toBe(true);
  });

  it('partial closure does not overlap non-intersecting window', () => {
    const partial = ScheduleClosure.close({
      tenantId: TENANT_ID,
      date,
      reason: ClosureReason.MAINTENANCE,
      createdBy: STAFF_ID,
      startTime: '10:00',
      endTime: '12:00',
    });
    expect(partial.overlaps(TimeOfDay.create('12:00'), TimeOfDay.create('14:00'))).toBe(false);
    expect(partial.overlaps(TimeOfDay.create('08:00'), TimeOfDay.create('10:00'))).toBe(false);
    expect(partial.overlaps(TimeOfDay.create('13:00'), TimeOfDay.create('15:00'))).toBe(false);
  });
});

describe('ScheduleClosure — resourceId (M21 Cluster 1)', () => {
  it('defaults resourceId to null when omitted', () => {
    const closure = ScheduleClosure.close({
      tenantId: TENANT_ID,
      date: futureDate(),
      reason: ClosureReason.HOLIDAY,
      createdBy: STAFF_ID,
    });
    expect(closure.resourceId).toBeNull();
  });

  it('stores resourceId when provided, without affecting other invariants', () => {
    const closure = ScheduleClosure.close({
      tenantId: TENANT_ID,
      date: futureDate(),
      reason: ClosureReason.HOLIDAY,
      createdBy: STAFF_ID,
      resourceId: RESOURCE_ID,
      startTime: '10:00',
      endTime: '12:00',
      notes: 'notes',
    });
    expect(closure.resourceId).toBe(RESOURCE_ID);
    expect(closure.startTime!.value).toBe('10:00');
    expect(closure.endTime!.value).toBe('12:00');
    expect(closure.notes).toBe('notes');
    expect(closure.isFullDay()).toBe(false);
  });
});

describe('ScheduleClosure.reconstitute()', () => {
  it('reconstitutes full-day closure without validation', () => {
    const props = {
      id: '00000000-0000-7000-8000-000000000099',
      tenantId: TENANT_ID,
      resourceId: null,
      date: '2020-01-01',
      startTime: null,
      endTime: null,
      reason: ClosureReason.HOLIDAY,
      notes: null,
      createdBy: STAFF_ID,
      createdAt: new Date('2020-01-01T00:00:00Z'),
    };
    const closure = ScheduleClosure.reconstitute(props);
    expect(closure.isFullDay()).toBe(true);
    expect(closure.startTime).toBeNull();
    expect(closure.resourceId).toBeNull();
  });

  it('reconstitutes partial closure from TimeOfDay VOs', () => {
    const props = {
      id: '00000000-0000-7000-8000-000000000099',
      tenantId: TENANT_ID,
      resourceId: RESOURCE_ID,
      date: '2020-01-01',
      startTime: TimeOfDay.create('10:00'),
      endTime: TimeOfDay.create('12:00'),
      reason: ClosureReason.MAINTENANCE,
      notes: null,
      createdBy: STAFF_ID,
      createdAt: new Date('2020-01-01T00:00:00Z'),
    };
    const closure = ScheduleClosure.reconstitute(props);
    expect(closure.isFullDay()).toBe(false);
    expect(closure.startTime!.value).toBe('10:00');
    expect(closure.endTime!.value).toBe('12:00');
    expect(closure.resourceId).toBe(RESOURCE_ID);
  });
});
