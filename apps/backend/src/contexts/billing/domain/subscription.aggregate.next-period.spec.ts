import { localDateEndUTC } from '../../../shared/utils/calendar-date';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { SubscriptionBuilder, SubscriptionItemBuilder } from '../../../test/builders/billing';
import { type StartSubscriptionInput, Subscription } from './subscription.aggregate';
import type { SuspensionReason } from './subscription.types';

const SAO_PAULO = 'America/Sao_Paulo';
const NEW_YORK = 'America/New_York';

function active(timezone: string, lastPaidDay: string | null): Subscription {
  return new SubscriptionBuilder()
    .withStatus('ACTIVE')
    .withTimezone(timezone)
    .withCurrentPeriod(
      new Date('2026-01-01T00:00:00Z'),
      lastPaidDay === null ? null : localDateEndUTC(lastPaidDay, timezone),
    )
    .build();
}

function startInput(overrides: Partial<StartSubscriptionInput> = {}): StartSubscriptionInput {
  return {
    tenantId: '0197a2b0-0000-7000-8000-000000000001',
    countryCode: CountryCode.create('BR'),
    currency: 'BRL',
    timezone: SAO_PAULO,
    merchantProfileKey: 'BRL_FAKE',
    start: new Date('2026-02-24T15:00:00Z'),
    ...overrides,
  };
}

describe('Subscription.nextPeriodStart (UC-136 main flow 3, A7, A14)', () => {
  describe('ACTIVE / PAST_DUE', () => {
    it('is the day after the last paid day, in the tenant timezone (UTC-3)', () => {
      expect(active(SAO_PAULO, '2026-03-31').nextPeriodStart(false)?.value).toBe('2026-04-01');
    });

    it.each([
      ['spring forward', '2026-03-07', '2026-03-08'],
      ['the day the clocks change', '2026-03-08', '2026-03-09'],
      ['fall back', '2026-10-31', '2026-11-01'],
      ['the day the clocks change back', '2026-11-01', '2026-11-02'],
    ])('stays a calendar day across a DST change (%s, America/New_York)', (_label, last, next) => {
      expect(active(NEW_YORK, last).nextPeriodStart(false)?.value).toBe(next);
    });

    it('is not shifted again when the next invoice is already paid: the paid-ahead period is already the last paid day', () => {
      const paidAhead = active(SAO_PAULO, '2026-04-30');

      expect(paidAhead.nextPeriodStart(true)?.value).toBe('2026-05-01');
      expect(paidAhead.nextPeriodStart(false)?.value).toBe('2026-05-01');
    });

    it('is null without a paid period', () => {
      expect(active(SAO_PAULO, null).nextPeriodStart(false)).toBeNull();
    });

    it('answers for a PAST_DUE subscription too', () => {
      const pastDue = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withCurrentPeriod(
          new Date('2026-02-01T00:00:00Z'),
          localDateEndUTC('2026-02-28', SAO_PAULO),
        )
        .build();

      expect(pastDue.nextPeriodStart(false)?.value).toBe('2026-03-01');
    });
  });

  describe('TRIALING', () => {
    it("is the trial's end day, the first invoice's start", () => {
      const trial = Subscription.startTrial(startInput());

      expect(trial.nextPeriodStart(false)?.value).toBe('2026-03-10');
    });

    it('is the period after it when the first invoice is already paid', () => {
      const trial = Subscription.startTrial(startInput());

      expect(trial.nextPeriodStart(true)?.value).toBe('2026-04-10');
    });

    it('steps to the clamped anchor day when the trial ends on the 29th to 31st', () => {
      const trial = Subscription.startTrial(
        startInput({ start: new Date('2026-01-17T15:00:00Z') }),
      );

      expect(trial.nextPeriodStart(false)?.value).toBe('2026-01-31');
      expect(trial.nextPeriodStart(true)?.value).toBe('2026-02-28');
    });
  });

  describe('no date to give', () => {
    it.each<SuspensionReason>(['NON_PAYMENT', 'CANCELED', 'PAYMENT_REVERSED', 'OPERATOR'])(
      'is null while SUSPENDED for %s',
      (reason) => {
        const suspended = new SubscriptionBuilder()
          .withStatus('SUSPENDED')
          .withSuspension(reason, new Date('2026-03-01T12:00:00Z'))
          .build();

        expect(suspended.nextPeriodStart(false)).toBeNull();
        expect(suspended.nextPeriodStart(true)).toBeNull();
      },
    );

    it('is null for an exempt subscription', () => {
      const exempt = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();

      expect(exempt.nextPeriodStart(false)).toBeNull();
    });
  });
});

describe('Subscription.planReadOnlyReason (UC-136 A2, A4, A14; UC-117 A7)', () => {
  const base = () => new SubscriptionBuilder().withStatus('ACTIVE');

  it('is null for an editable plan', () => {
    expect(base().build().planReadOnlyReason).toBeNull();
    expect(new SubscriptionBuilder().build().planReadOnlyReason).toBeNull();
  });

  it.each([
    ['exempt', base().withExempt(true), 'EXEMPT'],
    ['past due', new SubscriptionBuilder().withStatus('PAST_DUE'), 'PAST_DUE'],
    [
      'a scheduled cancel',
      base().withCancelAt(new Date('2026-05-01T00:00:00Z')),
      'CANCEL_SCHEDULED',
    ],
    [
      'an operator suspension',
      new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('OPERATOR', new Date('2026-03-01T12:00:00Z')),
      'OPERATOR_SUSPENDED',
    ],
  ])('reports %s', (_label, builder, reason) => {
    expect(builder.build().planReadOnlyReason).toBe(reason);
  });

  it.each<SuspensionReason>(['NON_PAYMENT', 'PAYMENT_REVERSED', 'CANCELED'])(
    'is null while suspended for %s: choosing the plan before paying is allowed (A14)',
    (reason) => {
      const suspended = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension(reason, new Date('2026-03-01T12:00:00Z'))
        .build();

      expect(suspended.planReadOnlyReason).toBeNull();
    },
  );
});

describe('Subscription.previewSelection dates', () => {
  const items = ['HOTSITE', 'BOOKING'] as const;
  const build = (status: 'ACTIVE' | 'SUSPENDED', reason?: SuspensionReason): Subscription => {
    const builder = new SubscriptionBuilder()
      .withStatus(status)
      .withTimezone(SAO_PAULO)
      .withCurrentPeriod(new Date('2026-03-01T03:00:00Z'), localDateEndUTC('2026-03-31', SAO_PAULO))
      .withItems(
        items.map((featureKey) =>
          new SubscriptionItemBuilder()
            .withFeatureKey(featureKey)
            .withStartsAt(new Date('2026-01-01T00:00:00Z'))
            .build(),
        ),
      );
    if (reason) builder.withSuspension(reason, new Date('2026-03-15T12:00:00Z'));
    return builder.build();
  };

  it('dates every change and the preview itself at the next period start', () => {
    const preview = build('ACTIVE').previewSelection([{ featureKey: 'HOTSITE', tier: 'STANDARD' }]);

    expect(preview.effectiveFrom?.value).toBe('2026-04-01');
    expect(preview.changes.map((change) => [change.kind, change.effectiveFrom?.value])).toEqual([
      ['REMOVE', '2026-04-01'],
    ]);
  });

  it('leaves every date null while suspended for payment (the plan applies at the payment)', () => {
    const preview = build('SUSPENDED', 'NON_PAYMENT').previewSelection([
      { featureKey: 'HOTSITE', tier: 'STANDARD' },
    ]);

    expect(preview.effectiveFrom).toBeNull();
    expect(preview.changes.every((change) => change.effectiveFrom === null)).toBe(true);
  });
});
