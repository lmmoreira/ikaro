import {
  ListRecurringBookingSchedulesQuerySchema,
  ScheduleClosuresRangeQuerySchema,
  ScheduleDayGridQuerySchema,
  UpdateServiceBookingPolicySchema,
} from './booking';

describe('UpdateServiceBookingPolicySchema — recurringHorizonDays', () => {
  it.each([1, 90, 180, null])('accepts %j', (recurringHorizonDays) => {
    expect(UpdateServiceBookingPolicySchema.safeParse({ recurringHorizonDays }).success).toBe(true);
  });

  it('accepts an omitted field', () => {
    expect(UpdateServiceBookingPolicySchema.safeParse({}).success).toBe(true);
  });

  it.each([0, -1, 181, 365, 1.5])('rejects %j', (recurringHorizonDays) => {
    expect(UpdateServiceBookingPolicySchema.safeParse({ recurringHorizonDays }).success).toBe(
      false,
    );
  });
});

describe('ScheduleDayGridQuerySchema', () => {
  it('accepts a real calendar date', () => {
    expect(ScheduleDayGridQuerySchema.safeParse({ date: '2026-06-01' }).success).toBe(true);
  });

  it('rejects a calendar-impossible date as a date-format issue on the date field', () => {
    const result = ScheduleDayGridQuerySchema.safeParse({ date: '2026-02-30' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({
      code: 'invalid_format',
      format: 'date',
      path: ['date'],
    });
  });
});

describe('ScheduleClosuresRangeQuerySchema', () => {
  const RESOURCE_ID = '0197a1f0-0000-7000-8000-000000000001';

  it('accepts a from/to range with an optional resourceId', () => {
    expect(
      ScheduleClosuresRangeQuerySchema.safeParse({ from: '2026-06-01', to: '2026-06-30' }).success,
    ).toBe(true);
    expect(
      ScheduleClosuresRangeQuerySchema.safeParse({
        from: '2026-06-01',
        to: '2026-06-30',
        resourceId: RESOURCE_ID,
      }).success,
    ).toBe(true);
  });

  it('rejects a calendar-impossible bound', () => {
    const result = ScheduleClosuresRangeQuerySchema.safeParse({
      from: '2026-06-01',
      to: '2026-06-31',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ format: 'date', path: ['to'] });
  });

  it('rejects a non-uuid resourceId', () => {
    expect(
      ScheduleClosuresRangeQuerySchema.safeParse({
        from: '2026-06-01',
        to: '2026-06-30',
        resourceId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });
});

describe('ListRecurringBookingSchedulesQuerySchema', () => {
  it('defaults to limit 25, offset 0 and no status filter', () => {
    expect(ListRecurringBookingSchedulesQuerySchema.parse({})).toEqual({ limit: 25, offset: 0 });
  });

  it('coerces query-string numbers and accepts a status', () => {
    expect(
      ListRecurringBookingSchedulesQuerySchema.parse({
        limit: '10',
        offset: '20',
        status: 'PENDING_APPROVAL',
      }),
    ).toEqual({ limit: 10, offset: 20, status: 'PENDING_APPROVAL' });
  });

  it.each([{ limit: '0' }, { limit: '101' }, { offset: '-1' }, { status: 'NOPE' }])(
    'rejects out-of-range input %j',
    (input) => {
      expect(ListRecurringBookingSchedulesQuerySchema.safeParse(input).success).toBe(false);
    },
  );
});
