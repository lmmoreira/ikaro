import {
  DurationMinutesQuerySchema,
  isResourceIdExclusiveOfSelections,
  QuoteServiceDurationQuerySchema,
  ListRecurringBookingSchedulesQuerySchema,
  ResourceSelectionsQuerySchema,
  ResourceSelectionsQueryStringSchema,
  ScheduleClosuresRangeQuerySchema,
  ScheduleDayGridQuerySchema,
  UpdateServiceBookingPolicySchema,
  MarkBookingNoShowSchema,
  CorrectBookingNoShowSchema,
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

describe('MarkBookingNoShowSchema', () => {
  it('accepts a missing body and defaults it to an empty object', () => {
    expect(MarkBookingNoShowSchema.parse(undefined)).toEqual({});
  });

  it('trims the reason and caps it at 500 characters', () => {
    expect(MarkBookingNoShowSchema.parse({ reason: '  ok  ' })).toEqual({ reason: 'ok' });
    expect(MarkBookingNoShowSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
    expect(MarkBookingNoShowSchema.safeParse({ reason: '   ' }).success).toBe(false);
  });
});

describe('CorrectBookingNoShowSchema', () => {
  const ok = { correctedStatus: 'COMPLETED', reason: 'Cliente foi atendido.' };

  it('accepts COMPLETED with a 10–500 character trimmed reason', () => {
    expect(CorrectBookingNoShowSchema.safeParse(ok).success).toBe(true);
  });

  it.each([
    { ...ok, correctedStatus: 'CANCELLED' },
    { ...ok, reason: '   curto   ' },
    { ...ok, reason: 'x'.repeat(501) },
    { correctedStatus: 'COMPLETED' },
  ])('rejects %j', (input) => {
    expect(CorrectBookingNoShowSchema.safeParse(input).success).toBe(false);
  });
});

describe('ResourceSelectionsQuerySchema', () => {
  const serviceId = '0198a000-0000-7000-8000-000000000001';
  const staffId = '0198a000-0000-7000-8000-000000000002';
  const roomId = '0198a000-0000-7000-8000-000000000003';

  it('parses comma-joined items, mapping "-" to a null legIndex', () => {
    const result = ResourceSelectionsQuerySchema.safeParse(
      `${serviceId}:-:STAFF:${staffId},${serviceId}:2:ROOM:${roomId}`,
    );
    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      { serviceId, legIndex: null, resourceType: 'STAFF', resourceId: staffId },
      { serviceId, legIndex: 2, resourceType: 'ROOM', resourceId: roomId },
    ]);
  });

  it.each([
    ['too few segments', `${serviceId}:-:STAFF`],
    ['too many segments', `${serviceId}:-:STAFF:${staffId}:x`],
    ['an empty item', `${serviceId}:-:STAFF:${staffId},`],
    ['a non-numeric legIndex', `${serviceId}:x:STAFF:${staffId}`],
    ['a negative legIndex', `${serviceId}:-1:STAFF:${staffId}`],
    ['an unknown resourceType', `${serviceId}:-:WIZARD:${staffId}`],
    ['a non-uuid resourceId', `${serviceId}:-:STAFF:not-a-uuid`],
  ])('rejects %s', (_label, raw) => {
    expect(ResourceSelectionsQuerySchema.safeParse(raw).success).toBe(false);
  });

  it('rejects more than 100 items', () => {
    const item = `${serviceId}:-:STAFF:${staffId}`;
    expect(ResourceSelectionsQuerySchema.safeParse(Array(101).fill(item).join(',')).success).toBe(
      false,
    );
  });
});

describe('isResourceIdExclusiveOfSelections', () => {
  it.each([
    [{}, true],
    [{ resourceId: 'r' }, true],
    [{ resourceSelections: [] }, true],
    [{ resourceId: 'r', resourceSelections: [] }, false],
  ])('%j → %s', (query, expected) => {
    expect(isResourceIdExclusiveOfSelections(query)).toBe(expected);
  });
});

describe('ResourceSelectionsQueryStringSchema', () => {
  const serviceId = '0198a000-0000-7000-8000-000000000001';
  const resourceId = '0198a000-0000-7000-8000-000000000002';

  it('keeps a valid value as the original string (no re-serialization needed by a proxy)', () => {
    const raw = `${serviceId}:-:STAFF:${resourceId},${serviceId}:1:ROOM:${resourceId}`;

    const result = ResourceSelectionsQueryStringSchema.safeParse(raw);

    expect(result.success).toBe(true);
    expect(result.data).toBe(raw);
  });

  it.each(['nope', `${serviceId}:-:WIZARD:${resourceId}`, `${serviceId}:-:STAFF:x`])(
    'rejects %s',
    (raw) => {
      expect(ResourceSelectionsQueryStringSchema.safeParse(raw).success).toBe(false);
    },
  );
});

describe('DurationMinutesQuerySchema / QuoteServiceDurationQuerySchema', () => {
  it('coerces a query-string duration to a positive integer', () => {
    expect(DurationMinutesQuerySchema.parse('90')).toBe(90);
  });

  it.each(['0', '-30', '1.5', 'abc', ''])('rejects %j', (raw) => {
    expect(DurationMinutesQuerySchema.safeParse(raw).success).toBe(false);
  });

  it('keeps durationMinutes optional on the quote query', () => {
    expect(QuoteServiceDurationQuerySchema.safeParse({}).success).toBe(true);
    expect(QuoteServiceDurationQuerySchema.parse({ durationMinutes: '60' })).toEqual({
      durationMinutes: 60,
    });
  });
});
