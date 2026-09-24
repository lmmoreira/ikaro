import { ScheduleClosuresRangeQuerySchema, ScheduleDayGridQuerySchema } from './booking';

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
