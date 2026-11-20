import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { SubscriptionBuilder } from '../../../test/builders/billing';
import { SubscriptionInvariantError } from './errors/billing-domain.error';

const TODAY = CalendarDate.create('2026-03-01');

describe('Subscription.isDueForIssue (UC-113)', () => {
  it('is due once the due date is within the 10-day lead, not before', () => {
    const subscription = (nextDueDate: string) =>
      new SubscriptionBuilder().withStatus('ACTIVE').withNextDueDate(nextDueDate).build();

    expect(subscription('2026-03-11').isDueForIssue(TODAY)).toBe(true);
    expect(subscription('2026-03-12').isDueForIssue(TODAY)).toBe(false);
  });

  it('stays due when the date has already passed (a missed run is caught up)', () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withNextDueDate('2026-02-20')
      .build();

    expect(subscription.isDueForIssue(TODAY)).toBe(true);
  });

  it.each(['PAST_DUE', 'SUSPENDED'] as const)(
    'A4 / PAST_DUE: a %s subscription is never due, however close its date',
    (status) => {
      const subscription = new SubscriptionBuilder()
        .withStatus(status)
        .withNextDueDate('2026-03-02')
        .build();

      expect(subscription.isDueForIssue(TODAY)).toBe(false);
    },
  );

  it('A1: an exempt subscription is never due', () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withExempt(true)
      .withNextDueDate('2026-03-02')
      .build();

    expect(subscription.isDueForIssue(TODAY)).toBe(false);
  });

  it('is not due without a due date', () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withNextDueDate(null)
      .build();

    expect(subscription.isDueForIssue(TODAY)).toBe(false);
  });

  describe('a trial', () => {
    const trial = (nextDueDate: string, confirmed: boolean) =>
      new SubscriptionBuilder()
        .withStatus('TRIALING')
        .withNextDueDate(nextDueDate)
        .withPlanConfirmedAt(confirmed ? new Date('2026-02-20T12:00:00Z') : null)
        .build();

    it('with a confirmed plan is invoiced as soon as the due date is within 10 days', () => {
      expect(trial('2026-03-11', true).isDueForIssue(TODAY)).toBe(true);
      expect(trial('2026-03-12', true).isDueForIssue(TODAY)).toBe(false);
    });

    it('A10: with no confirmed plan waits for the fallback day, 3 days before the end', () => {
      expect(trial('2026-03-11', false).isDueForIssue(TODAY)).toBe(false);
      expect(trial('2026-03-05', false).isDueForIssue(TODAY)).toBe(false);
      expect(trial('2026-03-04', false).isDueForIssue(TODAY)).toBe(true);
    });
  });

  describe('A5: a cancelling subscription', () => {
    // 2026-04-01 00:00 in São Paulo (UTC-3) is 03:00Z.
    const cancelling = (cancelAt: string) =>
      new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withNextDueDate('2026-04-01')
        .withCancelAt(new Date(cancelAt))
        .build();

    it('is not invoiced for a period that starts at or after cancelAt', () => {
      expect(
        cancelling('2026-04-01T03:00:00.000Z').isDueForIssue(CalendarDate.create('2026-03-25')),
      ).toBe(false);
      expect(
        cancelling('2026-03-31T12:00:00.000Z').isDueForIssue(CalendarDate.create('2026-03-25')),
      ).toBe(false);
    });

    it('is invoiced while cancelAt is still beyond the period start', () => {
      expect(
        cancelling('2026-05-01T03:00:00.000Z').isDueForIssue(CalendarDate.create('2026-03-25')),
      ).toBe(true);
    });
  });
});

describe('Subscription.advanceToNextPeriod', () => {
  const advance = (nextDueDate: string, anchorDay: number) => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withAnchorDay(anchorDay)
      .withNextDueDate(nextDueDate)
      .build();
    const window = subscription.advanceToNextPeriod();
    return { window, subscription };
  };

  it('covers the month from the due date to the day before the next anchor, and moves the due date', () => {
    const { window, subscription } = advance('2026-03-15', 15);

    expect(window.periodStart.value).toBe('2026-03-15');
    expect(window.periodEnd.value).toBe('2026-04-14');
    expect(window.nextDueDate.value).toBe('2026-04-15');
    expect(subscription.nextDueDate?.value).toBe('2026-04-15');
  });

  it('keeps the anchor day clamped to 28 across a short month (a trial ending on the 31st)', () => {
    const first = advance('2026-01-31', 28);
    expect(first.window.periodEnd.value).toBe('2026-02-27');
    expect(first.window.nextDueDate.value).toBe('2026-02-28');

    const second = advance('2026-02-28', 28);
    expect(second.window.nextDueDate.value).toBe('2026-03-28');
  });

  it('rolls over the year', () => {
    const { window } = advance('2026-12-15', 15);

    expect(window.periodEnd.value).toBe('2027-01-14');
    expect(window.nextDueDate.value).toBe('2027-01-15');
  });

  it('refuses a subscription with no due date', () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withNextDueDate(null)
      .build();

    expect(() => subscription.advanceToNextPeriod()).toThrow(SubscriptionInvariantError);
  });
});
