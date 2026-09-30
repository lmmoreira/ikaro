import { buildBookingListParams, isStaffOrManagerRole } from './bookings-list-query.util';

describe('buildBookingListParams', () => {
  const base = { status: 'APPROVED', page: 1, limit: 20 };

  it('maps status, limit and page to status, limit and offset', () => {
    expect(buildBookingListParams({ ...base, page: 3, limit: 10 })).toEqual({
      status: 'APPROVED',
      limit: 10,
      offset: 20,
    });
  });

  it('forwards recurringScheduleId when given and omits it otherwise', () => {
    const id = '00000000-0000-4000-8000-000000000001';

    expect(buildBookingListParams({ ...base, recurringScheduleId: id })).toMatchObject({
      recurringScheduleId: id,
    });
    expect(buildBookingListParams(base)).not.toHaveProperty('recurringScheduleId');
  });

  it('sends no from/to when no date filter is given', () => {
    const params = buildBookingListParams(base);

    expect(params).not.toHaveProperty('from');
    expect(params).not.toHaveProperty('to');
  });

  it('forwards date as from = to, both as the same date key', () => {
    const params = buildBookingListParams({ ...base, date: '2026-08-16' });

    expect(params).toMatchObject({ from: '2026-08-16', to: '2026-08-16' });
  });

  it('forwards from and to unchanged as date keys', () => {
    const params = buildBookingListParams({ ...base, from: '2026-08-10', to: '2026-08-16' });

    expect(params).toMatchObject({ from: '2026-08-10', to: '2026-08-16' });
  });

  it('forwards from alone without a to', () => {
    const params = buildBookingListParams({ ...base, from: '2026-08-10' });

    expect(params).toMatchObject({ from: '2026-08-10' });
    expect(params).not.toHaveProperty('to');
  });

  it('prefers date over from/to when both are present', () => {
    const params = buildBookingListParams({
      ...base,
      date: '2026-08-16',
      from: '2026-08-10',
      to: '2026-08-12',
    });

    expect(params).toMatchObject({ from: '2026-08-16', to: '2026-08-16' });
  });

  it('never attaches a time-of-day or UTC suffix to any date bound', () => {
    const forDate = buildBookingListParams({ ...base, date: '2026-08-16' });
    const forRange = buildBookingListParams({ ...base, from: '2026-08-10', to: '2026-08-16' });

    for (const bound of [forDate.from, forDate.to, forRange.from, forRange.to]) {
      expect(bound).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('isStaffOrManagerRole', () => {
  it.each(['MANAGER', 'STAFF'])('returns true for %s', (role) => {
    expect(isStaffOrManagerRole(role)).toBe(true);
  });

  it('returns false for CUSTOMER', () => {
    expect(isStaffOrManagerRole('CUSTOMER')).toBe(false);
  });
});
