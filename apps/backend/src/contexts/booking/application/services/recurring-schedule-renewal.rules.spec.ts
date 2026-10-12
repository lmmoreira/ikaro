import { isRenewalOffered, isRenewalReminderDue } from './recurring-schedule-renewal.rules';

const TODAY = '2026-10-12';

describe('isRenewalReminderDue()', () => {
  const active = { status: 'ACTIVE', startsOn: '2026-08-01', endsOn: '2026-10-19' } as const;

  it('is due on the one day endsOn is exactly N days away', () => {
    expect(isRenewalReminderDue(active, TODAY, 7)).toBe(true);
  });

  it.each([
    ['the day before', '2026-10-11'],
    ['the day after', '2026-10-13'],
  ])('is not due %s', (_label, today) => {
    expect(isRenewalReminderDue(active, today, 7)).toBe(false);
  });

  it('is never due when the reminder is off (N = 0)', () => {
    expect(isRenewalReminderDue({ ...active, endsOn: TODAY }, TODAY, 0)).toBe(false);
  });

  it.each(['PENDING_APPROVAL', 'CANCELLED', 'ENDED'] as const)(
    'is never due for a %s schedule',
    (status) => {
      expect(isRenewalReminderDue({ ...active, status }, TODAY, 7)).toBe(false);
    },
  );

  it('is not due when the whole term is no longer than the lead time', () => {
    // 7-day term ending in 7 days: it would start today, so there is nothing to renew early.
    expect(
      isRenewalReminderDue({ status: 'ACTIVE', startsOn: TODAY, endsOn: '2026-10-19' }, TODAY, 7),
    ).toBe(false);
  });

  it('is due when the term is one day longer than the lead time', () => {
    expect(
      isRenewalReminderDue(
        { status: 'ACTIVE', startsOn: '2026-10-11', endsOn: '2026-10-19' },
        TODAY,
        7,
      ),
    ).toBe(true);
  });
});

describe('isRenewalOffered()', () => {
  it.each([
    ['today', '2026-10-12'],
    ['inside the window', '2026-10-15'],
    ['the last day of the window (today + N)', '2026-10-19'],
  ])('offers an ACTIVE schedule ending %s', (_label, endsOn) => {
    expect(isRenewalOffered({ status: 'ACTIVE', endsOn }, TODAY, 7)).toBe(true);
  });

  it.each([
    ['after the window', '2026-10-20'],
    ['already in the past', '2026-10-11'],
  ])('does not offer an ACTIVE schedule ending %s', (_label, endsOn) => {
    expect(isRenewalOffered({ status: 'ACTIVE', endsOn }, TODAY, 7)).toBe(false);
  });

  it('offers an ENDED schedule however long ago it ended', () => {
    expect(isRenewalOffered({ status: 'ENDED', endsOn: '2025-01-01' }, TODAY, 7)).toBe(true);
  });

  it('keeps an ENDED schedule renewable when the reminder is off, but empties the ACTIVE window', () => {
    expect(isRenewalOffered({ status: 'ENDED', endsOn: '2026-10-01' }, TODAY, 0)).toBe(true);
    expect(isRenewalOffered({ status: 'ACTIVE', endsOn: TODAY }, TODAY, 0)).toBe(false);
  });

  it.each(['PENDING_APPROVAL', 'CANCELLED'] as const)('never offers a %s schedule', (status) => {
    expect(isRenewalOffered({ status, endsOn: '2026-10-15' }, TODAY, 7)).toBe(false);
  });
});
