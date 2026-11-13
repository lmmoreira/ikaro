import { FEATURE_KEYS } from '@ikaro/validation';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { TimezoneValidationError } from '../../../shared/value-objects/timezone.vo';
import { SubscriptionBuilder, SubscriptionItemBuilder } from '../../../test/builders/billing';
import {
  ExemptProtectedError,
  FeatureDependencyUnmetError,
  FeatureHasDependentsError,
  GraceNotAllowedError,
  PlanEmptyError,
  SubscriptionInvariantError,
  UnsuspendNotAllowedError,
} from './errors/billing-domain.error';
import { type StartSubscriptionInput, Subscription } from './subscription.aggregate';

const at = (iso: string): Date => new Date(iso);
const DAY_MS = 24 * 60 * 60 * 1000;

function startInput(overrides: Partial<StartSubscriptionInput> = {}): StartSubscriptionInput {
  return {
    tenantId: '0197a2b0-0000-7000-8000-000000000001',
    countryCode: CountryCode.create('BR'),
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    merchantProfileKey: 'BRL_FAKE',
    start: at('2026-01-10T15:00:00Z'),
    ...overrides,
  };
}

/** Whether any two windows of one feature overlap — the invariant the DB GIST backstops. */
function hasOverlap(subscription: Subscription): boolean {
  const items = subscription.items;
  return items.some((a, i) => items.slice(i + 1).some((b) => a.overlaps(b)));
}

describe('Subscription', () => {
  describe('startTrial', () => {
    it('starts TRIALING with no payment history and a never-persisted version', () => {
      const subscription = Subscription.startTrial(startInput());

      expect(subscription.status).toBe('TRIALING');
      expect(subscription.suspensionReason).toBeNull();
      expect(subscription.hasEverPaid).toBe(false);
      expect(subscription.exempt).toBe(false);
      expect(subscription.cycle).toBe('MONTHLY');
      expect(subscription.version).toBeUndefined();
      expect(subscription.currentPeriodStart).toBeNull();
      expect(subscription.currentPeriodEnd).toBeNull();
      expect(subscription.merchantProfileKey).toBe('BRL_FAKE');
      expect(subscription.countryCode.value).toBe('BR');
    });

    it('ends the trial at the tenant-local midnight closing day 14 and dates the first invoice then', () => {
      // 2026-01-10 12:00 in São Paulo (UTC-3) → local day Jan 10 → +14 days = Jan 24, 00:00 local.
      const subscription = Subscription.startTrial(
        startInput({ start: at('2026-01-10T15:00:00Z') }),
      );

      expect(subscription.trialEndsAt).toEqual(at('2026-01-24T03:00:00Z'));
      expect(subscription.nextDueDate?.value).toBe('2026-01-24');
    });

    it('computes the trial end across a DST change in the snapshot zone', () => {
      // New York springs forward on 2026-03-08: Mar 1 10:00 EST + 14 calendar days = Mar 15 00:00
      // EDT (UTC-4), i.e. 04:00Z — a fixed 14 x 24h would land an hour off at 05:00Z.
      const subscription = Subscription.startTrial(
        startInput({
          countryCode: CountryCode.create('US'),
          currency: 'USD',
          timezone: 'America/New_York',
          merchantProfileKey: 'USD_FAKE',
          start: at('2026-03-01T15:00:00Z'),
        }),
      );

      expect(subscription.trialEndsAt?.toISOString()).toBe('2026-03-15T04:00:00.000Z');
    });

    it('creates one default paid item per feature starting at trialEndsAt, open-ended, chatbot at BASIC', () => {
      const subscription = Subscription.startTrial(startInput());

      expect(subscription.items).toHaveLength(FEATURE_KEYS.length);
      for (const item of subscription.items) {
        expect(item.startsAt).toEqual(subscription.trialEndsAt);
        expect(item.endsAt).toBeNull();
        expect(item.createdBy).toBe('SYSTEM');
        expect(item.tier).toBe(item.featureKey === 'CHATBOT' ? 'BASIC' : 'STANDARD');
      }
      expect(subscription.itemsDirty).toBe(true);
    });

    it('refuses a currency that is not the billing currency of the country', () => {
      expect(() => Subscription.startTrial(startInput({ currency: 'USD' }))).toThrow(
        SubscriptionInvariantError,
      );
    });

    it('refuses an invalid timezone', () => {
      expect(() => Subscription.startTrial(startInput({ timezone: 'Mars/Olympus' }))).toThrow(
        TimezoneValidationError,
      );
    });
  });

  describe('anchorDay', () => {
    // The parity cases of S05's backfill SQL, run through the aggregate: the anchor is the
    // day-of-month, in the snapshot timezone, of start + 14 days, clamped to 28.
    it.each([
      ['created on Jan 31', '2026-01-31T15:00:00Z', 14],
      ['created on Jan 15 (+14 = the 29th, clamped)', '2026-01-15T15:00:00Z', 28],
      ['created on Jan 20 (+14 lands on Feb 3)', '2026-01-20T15:00:00Z', 3],
      ['created 02:00 UTC on Feb 1 = Jan 31 23:00 local', '2026-02-01T02:00:00Z', 14],
    ])('startTrial and startExempt agree for a tenant %s', (_name, start, expected) => {
      const trial = Subscription.startTrial(startInput({ start: at(start) }));
      const exempt = Subscription.startExempt(startInput({ start: at(start) }));

      expect(trial.anchorDay).toBe(expected);
      expect(exempt.anchorDay).toBe(expected);
    });

    it('is always within 1..28', () => {
      for (let day = 0; day < 60; day += 1) {
        const subscription = Subscription.startTrial(
          startInput({ start: new Date(at('2026-01-01T15:00:00Z').getTime() + day * DAY_MS) }),
        );
        expect(subscription.anchorDay).toBeGreaterThanOrEqual(1);
        expect(subscription.anchorDay).toBeLessThanOrEqual(28);
      }
    });
  });

  describe('startExempt', () => {
    it('starts ACTIVE and exempt with open-ended items from the start and every trial/period/due field NULL', () => {
      const start = at('2026-01-10T15:00:00Z');
      const subscription = Subscription.startExempt(startInput({ start }));

      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.exempt).toBe(true);
      expect(subscription.trialEndsAt).toBeNull();
      expect(subscription.nextDueDate).toBeNull();
      expect(subscription.currentPeriodStart).toBeNull();
      expect(subscription.currentPeriodEnd).toBeNull();
      expect(subscription.pastDueSince).toBeNull();
      expect(subscription.graceUntil).toBeNull();
      expect(subscription.cancelAt).toBeNull();
      expect(subscription.planConfirmedAt).toBeNull();
      expect(subscription.suspendedAt).toBeNull();
      expect(subscription.items).toHaveLength(FEATURE_KEYS.length);
      expect(subscription.items.every((item) => item.startsAt.getTime() === start.getTime())).toBe(
        true,
      );
      expect(subscription.items.every((item) => item.endsAt === null)).toBe(true);
    });

    it('entitles every feature through its items', () => {
      const start = at('2026-01-10T15:00:00Z');
      const subscription = Subscription.startExempt(startInput({ start }));

      expect(subscription.entitledAt(start).map((entry) => entry.featureKey)).toEqual([
        ...FEATURE_KEYS,
      ]);
    });
  });

  describe('entitlement', () => {
    const now = at('2026-03-01T12:00:00Z');

    it('entitles a TRIALING subscription to every feature with no items at all', () => {
      const subscription = new SubscriptionBuilder().withStatus('TRIALING').withItems([]).build();

      const entitled = subscription.entitledAt(now);

      expect(entitled.map((entry) => entry.featureKey)).toEqual([...FEATURE_KEYS]);
      expect(entitled.find((entry) => entry.featureKey === 'CHATBOT')?.tier).toBe('BASIC');
    });

    it('entitles an ACTIVE subscription only to its active items', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([
          new SubscriptionItemBuilder()
            .withFeatureKey('HOTSITE')
            .withStartsAt(at('2026-01-01T00:00:00Z'))
            .build(),
          new SubscriptionItemBuilder()
            .withFeatureKey('BOOKING')
            .withStartsAt(at('2026-01-01T00:00:00Z'))
            .build(),
        ])
        .build();

      expect(subscription.entitledAt(now)).toEqual([
        { featureKey: 'HOTSITE', tier: 'STANDARD' },
        { featureKey: 'BOOKING', tier: 'STANDARD' },
      ]);
    });

    it('drops an item that ends exactly at now and keeps one that starts exactly at now', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([
          new SubscriptionItemBuilder()
            .withFeatureKey('HOTSITE')
            .withStartsAt(at('2026-01-01T00:00:00Z'))
            .withEndsAt(now)
            .build(),
          new SubscriptionItemBuilder().withFeatureKey('BOOKING').withStartsAt(now).build(),
        ])
        .build();

      expect(subscription.entitledAt(now)).toEqual([{ featureKey: 'BOOKING', tier: 'STANDARD' }]);
    });

    it('keeps full access while PAST_DUE', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withItems([new SubscriptionItemBuilder().withStartsAt(at('2026-01-01T00:00:00Z')).build()])
        .build();

      expect(subscription.entitledAt(now)).toHaveLength(1);
      expect(subscription.operational).toBe(true);
    });

    it('entitles a SUSPENDED subscription to nothing and marks it not operational', () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('NON_PAYMENT', now)
        .withItems([new SubscriptionItemBuilder().withStartsAt(at('2026-01-01T00:00:00Z')).build()])
        .build();

      expect(subscription.entitledAt(now)).toEqual([]);
      expect(subscription.operational).toBe(false);
    });
  });

  describe('validateSelection / previewSelection', () => {
    function activeWithAllFeatures(): Subscription {
      return new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withCurrentPeriod(at('2026-03-01T03:00:00Z'), at('2026-04-01T03:00:00Z'))
        .withItems(
          FEATURE_KEYS.map((featureKey) =>
            new SubscriptionItemBuilder()
              .withFeatureKey(featureKey)
              .withTier(featureKey === 'CHATBOT' ? 'BASIC' : 'STANDARD')
              .withStartsAt(at('2026-01-01T00:00:00Z'))
              .build(),
          ),
        )
        .build();
    }

    it('validates against the plan going forward: removing a dependency of a kept feature is HAS_DEPENDENTS', () => {
      const subscription = activeWithAllFeatures();

      expect(() =>
        subscription.validateSelection([
          { featureKey: 'HOTSITE', tier: 'STANDARD' },
          { featureKey: 'LOYALTY', tier: 'STANDARD' },
        ]),
      ).toThrow(FeatureHasDependentsError);
    });

    it('treats a feature scheduled to leave as no longer part of the plan', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([
          new SubscriptionItemBuilder()
            .withFeatureKey('HOTSITE')
            .withStartsAt(at('2026-01-01T00:00:00Z'))
            .build(),
          new SubscriptionItemBuilder()
            .withFeatureKey('BOOKING')
            .withStartsAt(at('2026-01-01T00:00:00Z'))
            .withEndsAt(at('2026-04-01T00:00:00Z'))
            .build(),
        ])
        .build();

      expect(subscription.selection).toEqual([{ featureKey: 'HOTSITE', tier: 'STANDARD' }]);
      expect(() =>
        subscription.validateSelection([
          { featureKey: 'HOTSITE', tier: 'STANDARD' },
          { featureKey: 'LOYALTY', tier: 'STANDARD' },
        ]),
      ).toThrow(FeatureDependencyUnmetError);
    });

    it('previews ADD, REMOVE and TIER_CHANGE with the next paid period start, in catalogue order', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withCurrentPeriod(at('2026-03-01T03:00:00Z'), at('2026-04-01T03:00:00Z'))
        .withItems([
          new SubscriptionItemBuilder()
            .withFeatureKey('HOTSITE')
            .withStartsAt(at('2026-01-01T00:00:00Z'))
            .build(),
          new SubscriptionItemBuilder()
            .withFeatureKey('BOOKING')
            .withStartsAt(at('2026-01-01T00:00:00Z'))
            .build(),
          new SubscriptionItemBuilder()
            .withFeatureKey('CHATBOT')
            .withTier('BASIC')
            .withStartsAt(at('2026-01-01T00:00:00Z'))
            .build(),
        ])
        .build();

      const { changes } = subscription.previewSelection([
        { featureKey: 'HOTSITE', tier: 'STANDARD' },
        { featureKey: 'CHATBOT', tier: 'PLUS' },
        { featureKey: 'LEAD_FORM', tier: 'STANDARD' },
      ]);

      const effectiveFrom = at('2026-04-01T03:00:00Z');
      expect(changes).toEqual([
        { featureKey: 'BOOKING', tier: 'STANDARD', kind: 'REMOVE', effectiveFrom },
        { featureKey: 'CHATBOT', tier: 'PLUS', kind: 'TIER_CHANGE', effectiveFrom },
        { featureKey: 'LEAD_FORM', tier: 'STANDARD', kind: 'ADD', effectiveFrom },
      ]);
    });

    it("dates a trial subscription's changes at trialEndsAt and reports no change for an identical selection", () => {
      const trialEndsAt = at('2026-03-10T03:00:00Z');
      const subscription = Subscription.startTrial(
        startInput({ start: at('2026-02-24T15:00:00Z') }),
      );

      expect(subscription.trialEndsAt).toEqual(trialEndsAt);
      expect(subscription.previewSelection(subscription.selection).changes).toEqual([]);
      const preview = subscription.previewSelection([{ featureKey: 'HOTSITE', tier: 'STANDARD' }]);
      expect(
        preview.changes.every(
          (change) => change.effectiveFrom?.getTime() === trialEndsAt.getTime(),
        ),
      ).toBe(true);
      expect(preview.changes).toHaveLength(FEATURE_KEYS.length - 1);
    });

    it('rejects exactly as validateSelection does, and saves nothing', () => {
      const subscription = activeWithAllFeatures();
      const before = JSON.stringify(subscription.items);

      expect(() => subscription.previewSelection([])).toThrow(PlanEmptyError);
      expect(JSON.stringify(subscription.items)).toBe(before);
      expect(subscription.itemsDirty).toBe(false);
    });
  });

  describe('suspendByOperator', () => {
    const now = at('2026-03-01T12:00:00Z');

    it('suspends with reason OPERATOR and stamps suspendedAt', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();

      subscription.suspendByOperator(now, 'corr-1');

      expect(subscription.status).toBe('SUSPENDED');
      expect(subscription.suspensionReason).toBe('OPERATOR');
      expect(subscription.suspendedAt).toEqual(now);
      expect(subscription.operational).toBe(false);
    });

    it('refuses an exempt subscription', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();

      expect(() => subscription.suspendByOperator(now, 'corr-1')).toThrow(ExemptProtectedError);
      expect(subscription.status).toBe('ACTIVE');
    });

    it('is a no-op when already OPERATOR-suspended', () => {
      const first = at('2026-02-01T00:00:00Z');
      const subscription = new SubscriptionBuilder().withSuspension('OPERATOR', first).build();

      subscription.suspendByOperator(now, 'corr-1');

      expect(subscription.suspendedAt).toEqual(first);
      expect(subscription.suspensionReason).toBe('OPERATOR');
    });

    it.each(['NON_PAYMENT', 'CANCELED', 'PAYMENT_REVERSED'] as const)(
      'leaves a %s suspension exactly as it is, so the operator can never lift it afterwards',
      (reason) => {
        const first = at('2026-02-01T00:00:00Z');
        const subscription = new SubscriptionBuilder().withSuspension(reason, first).build();

        expect(subscription.suspendByOperator(now, 'corr-1')).toBe(false);

        expect(subscription.suspensionReason).toBe(reason);
        expect(subscription.suspendedAt).toEqual(first);
        expect(() => subscription.unsuspendOperator(now, 'corr-1')).toThrow(
          UnsuspendNotAllowedError,
        );
      },
    );

    it('leaves the item rows alone (a status-only change)', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();

      subscription.suspendByOperator(now, 'corr-1');

      expect(subscription.itemsDirty).toBe(false);
    });
  });

  describe('purgeAt', () => {
    it('is null while not suspended', () => {
      expect(new SubscriptionBuilder().withStatus('ACTIVE').build().purgeAt).toBeNull();
    });

    it('is suspendedAt + 90 days when the subscription never paid', () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('NON_PAYMENT', at('2026-01-01T00:00:00Z'))
        .withHasEverPaid(false)
        .build();

      expect(subscription.purgeAt).toEqual(at('2026-04-01T00:00:00Z'));
    });

    it('is suspendedAt + 180 days when it paid at least once, whatever the reason', () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('CANCELED', at('2026-01-01T00:00:00Z'))
        .withHasEverPaid(true)
        .build();

      expect(subscription.purgeAt).toEqual(at('2026-06-30T00:00:00Z'));
    });
  });

  describe('unsuspendOperator', () => {
    const now = at('2026-03-01T12:00:00Z');

    it('lifts an OPERATOR suspension to ACTIVE once the trial window is over, clearing the clean-up clock', () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('OPERATOR', at('2026-02-20T00:00:00Z'))
        .withTrialEndsAt(at('2026-01-15T03:00:00Z'))
        .withPurgeWarnings(at('2026-02-25T00:00:00Z'), at('2026-02-27T00:00:00Z'))
        .build();

      subscription.unsuspendOperator(now, 'corr-1');

      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.suspensionReason).toBeNull();
      expect(subscription.suspendedAt).toBeNull();
      expect(subscription.purgeAt).toBeNull();
      expect(subscription.purgeWarning30SentAt).toBeNull();
      expect(subscription.purgeWarning7SentAt).toBeNull();
      expect(subscription.operational).toBe(true);
    });

    it('returns to TRIALING when the trial window is still running (the trial was never consumed)', () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('OPERATOR', at('2026-02-20T00:00:00Z'))
        .withTrialEndsAt(at('2026-03-10T03:00:00Z'))
        .build();

      subscription.unsuspendOperator(now, 'corr-1');

      expect(subscription.status).toBe('TRIALING');
    });

    it.each(['NON_PAYMENT', 'CANCELED', 'PAYMENT_REVERSED'] as const)(
      'is refused for a %s suspension — only a payment lifts it',
      (reason) => {
        const subscription = new SubscriptionBuilder().withSuspension(reason, now).build();

        expect(() => subscription.unsuspendOperator(now, 'corr-1')).toThrow(
          UnsuspendNotAllowedError,
        );
        expect(subscription.status).toBe('SUSPENDED');
      },
    );

    it('is a no-op (reports no change, raises nothing) when the subscription is not suspended at all', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();

      expect(subscription.unsuspendOperator(now, 'corr-1')).toBe(false);

      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.domainEvents).toEqual([]);
    });
  });

  describe('extendGrace', () => {
    const pastDueSince = at('2026-03-01T00:00:00Z');
    const pastDue = (): Subscription =>
      new SubscriptionBuilder().withStatus('PAST_DUE').withPastDueSince(pastDueSince).build();

    it('sets graceUntil at or after pastDueSince + 14 days', () => {
      const subscription = pastDue();

      subscription.extendGrace(at('2026-03-15T00:00:00Z')); // exactly +14 days
      expect(subscription.graceUntil).toEqual(at('2026-03-15T00:00:00Z'));

      subscription.extendGrace(at('2026-04-10T00:00:00Z'));
      expect(subscription.graceUntil).toEqual(at('2026-04-10T00:00:00Z'));
    });

    it('is refused for a graceUntil earlier than pastDueSince + 14 days — a grace never shortens the window', () => {
      const subscription = pastDue();

      expect(() => subscription.extendGrace(at('2026-03-14T23:59:59Z'))).toThrow(
        GraceNotAllowedError,
      );
      expect(subscription.graceUntil).toBeNull();
    });

    it('is refused for a graceUntil earlier than a grace already set — it only ever extends', () => {
      const subscription = pastDue();
      subscription.extendGrace(at('2026-04-10T00:00:00Z'));

      expect(() => subscription.extendGrace(at('2026-03-20T00:00:00Z'))).toThrow(
        GraceNotAllowedError,
      );
      expect(subscription.graceUntil).toEqual(at('2026-04-10T00:00:00Z'));
    });

    it.each(['TRIALING', 'ACTIVE', 'SUSPENDED'] as const)(
      'is refused unless PAST_DUE (%s)',
      (status) => {
        const builder = new SubscriptionBuilder().withPastDueSince(pastDueSince);
        const subscription =
          status === 'SUSPENDED'
            ? builder.withSuspension('NON_PAYMENT', pastDueSince).build()
            : builder.withStatus(status).build();

        expect(() => subscription.extendGrace(at('2026-04-10T00:00:00Z'))).toThrow(
          GraceNotAllowedError,
        );
      },
    );
  });

  describe('setExempt', () => {
    const now = at('2026-03-01T12:00:00Z');

    it('removes default paid items that have not started and opens every feature from now (a trial)', () => {
      const subscription = Subscription.startTrial(
        startInput({ start: at('2026-02-24T15:00:00Z') }),
      );
      subscription.markPersisted(0);

      subscription.setExempt(now, 'operator-7', 'corr-1');

      expect(subscription.exempt).toBe(true);
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.trialEndsAt).toBeNull();
      expect(subscription.nextDueDate).toBeNull();
      expect(subscription.items).toHaveLength(FEATURE_KEYS.length);
      expect(subscription.items.every((item) => item.startsAt.getTime() === now.getTime())).toBe(
        true,
      );
      expect(subscription.items.every((item) => item.endsAt === null)).toBe(true);
      expect(subscription.items.every((item) => item.createdBy === 'operator-7')).toBe(true);
      expect(subscription.itemsDirty).toBe(true);
    });

    it('end-dates the running items at now before inserting the open-ended ones (no overlap, touching allowed)', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withCurrentPeriod(at('2026-02-15T03:00:00Z'), at('2026-03-15T03:00:00Z'))
        .withItems(
          FEATURE_KEYS.map((featureKey) =>
            new SubscriptionItemBuilder()
              .withFeatureKey(featureKey)
              .withTier(featureKey === 'CHATBOT' ? 'BASIC' : 'STANDARD')
              .withStartsAt(at('2026-02-15T03:00:00Z'))
              .build(),
          ),
        )
        .build();

      subscription.setExempt(now, 'operator-7', 'corr-1');

      const items = subscription.items;
      const ended = items.filter((item) => item.endsAt !== null);
      const opened = items.filter((item) => item.endsAt === null);
      expect(ended).toHaveLength(FEATURE_KEYS.length);
      expect(ended.every((item) => item.endsAt?.getTime() === now.getTime())).toBe(true);
      expect(opened).toHaveLength(FEATURE_KEYS.length);
      expect(opened.every((item) => item.startsAt.getTime() === now.getTime())).toBe(true);
      expect(hasOverlap(subscription)).toBe(false);
      expect(subscription.currentPeriodStart).toBeNull();
      expect(subscription.currentPeriodEnd).toBeNull();
    });

    it('keeps already-ended items as history and leaves hasEverPaid untouched', () => {
      const history = new SubscriptionItemBuilder()
        .withFeatureKey('LEAD_FORM')
        .withStartsAt(at('2026-01-01T00:00:00Z'))
        .withEndsAt(at('2026-02-01T00:00:00Z'))
        .build();
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withHasEverPaid(true)
        .withItems([history])
        .build();

      subscription.setExempt(now, 'operator-7', 'corr-1');

      expect(subscription.items.find((item) => item.id === history.id)).toBe(history);
      expect(subscription.hasEverPaid).toBe(true);
    });

    it('reactivates a suspended subscription without payment and clears the clean-up clock (UC-137 A3)', () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('NON_PAYMENT', at('2026-02-01T00:00:00Z'))
        .withPurgeWarnings(at('2026-02-25T00:00:00Z'), null)
        .build();

      subscription.setExempt(now, 'operator-7', 'corr-1');

      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.suspensionReason).toBeNull();
      expect(subscription.suspendedAt).toBeNull();
      expect(subscription.purgeWarning30SentAt).toBeNull();
      expect(subscription.operational).toBe(true);
    });

    it('clears grace, cancel and the unconfirmed-plan marker (an exempt subscription is never charged)', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withPastDueSince(at('2026-02-01T00:00:00Z'))
        .withGraceUntil(at('2026-03-20T00:00:00Z'))
        .build();

      subscription.setExempt(now, 'operator-7', 'corr-1');

      expect(subscription.pastDueSince).toBeNull();
      expect(subscription.graceUntil).toBeNull();
      expect(subscription.cancelAt).toBeNull();
      expect(subscription.planConfirmedAt).toBeNull();
    });

    it('is a no-op when already exempt', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();

      subscription.setExempt(now, 'operator-7', 'corr-1');

      expect(subscription.itemsDirty).toBe(false);
      expect(subscription.items).toEqual([]);
    });
  });

  describe('clearExempt', () => {
    const now = at('2026-03-01T15:00:00Z');
    const exemptSubscription = (): Subscription =>
      Subscription.startExempt(startInput({ start: at('2026-01-10T15:00:00Z') }));

    it('refuses the platform-owner tenant', () => {
      const subscription = exemptSubscription();

      expect(() => subscription.clearExempt(now, 'operator-7', true)).toThrow(ExemptProtectedError);
      expect(subscription.exempt).toBe(true);
      expect(subscription.status).toBe('ACTIVE');
    });

    it('starts a fresh 14-day TRIALING window and recomputes the anchor', () => {
      const subscription = exemptSubscription();

      subscription.clearExempt(now, 'operator-7', false);

      expect(subscription.exempt).toBe(false);
      expect(subscription.status).toBe('TRIALING');
      // Mar 1 12:00 São Paulo → +14 days = Mar 15 00:00 local = 03:00Z.
      expect(subscription.trialEndsAt).toEqual(at('2026-03-15T03:00:00Z'));
      expect(subscription.nextDueDate?.value).toBe('2026-03-15');
      expect(subscription.anchorDay).toBe(15);
      expect(subscription.planConfirmedAt).toBeNull();
      expect(subscription.currentPeriodStart).toBeNull();
    });

    it('replaces the open-ended items with default paid items starting at the new trialEndsAt', () => {
      const subscription = exemptSubscription();

      subscription.clearExempt(now, 'operator-7', false);

      const ended = subscription.items.filter((item) => item.endsAt !== null);
      const defaults = subscription.items.filter((item) => item.endsAt === null);
      expect(ended).toHaveLength(FEATURE_KEYS.length);
      expect(ended.every((item) => item.endsAt?.getTime() === now.getTime())).toBe(true);
      expect(defaults).toHaveLength(FEATURE_KEYS.length);
      expect(
        defaults.every((item) => item.startsAt.getTime() === subscription.trialEndsAt?.getTime()),
      ).toBe(true);
      expect(defaults.every((item) => item.createdBy === 'operator-7')).toBe(true);
      expect(hasOverlap(subscription)).toBe(false);
      expect(subscription.itemsDirty).toBe(true);
    });

    it('never touches hasEverPaid and keeps the immutable timezone snapshot', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withExempt(true)
        .withHasEverPaid(true)
        .withTimezone('America/Manaus')
        .build();

      subscription.clearExempt(now, 'operator-7', false);

      expect(subscription.hasEverPaid).toBe(true);
      expect(subscription.timezone.value).toBe('America/Manaus');
    });

    it('is a no-op when not exempt, even for the platform owner', () => {
      const subscription = Subscription.startTrial(startInput());
      const items = subscription.items;

      subscription.clearExempt(now, 'operator-7', true);

      expect(subscription.status).toBe('TRIALING');
      expect(subscription.items).toEqual(items);
    });
  });

  describe('persistence bookkeeping', () => {
    it('reconstitute leaves itemsDirty false, so a status-only save writes no item row', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();

      expect(subscription.itemsDirty).toBe(false);
    });

    it('markPersisted records the stored version and clears itemsDirty', () => {
      const subscription = Subscription.startTrial(startInput());
      expect(subscription.itemsDirty).toBe(true);

      subscription.markPersisted(0);

      expect(subscription.version).toBe(0);
      expect(subscription.itemsDirty).toBe(false);
    });

    it('never reads a clock: the same inputs always give the same result', () => {
      const first = Subscription.startTrial(startInput());
      const second = Subscription.startTrial(startInput());

      expect(first.trialEndsAt).toEqual(second.trialEndsAt);
      expect(first.anchorDay).toBe(second.anchorDay);
    });

    it('raises no domain event on creation', () => {
      expect(Subscription.startTrial(startInput()).domainEvents).toEqual([]);
    });
  });

  describe('operator events (M25-S15b)', () => {
    const now = at('2026-03-01T12:00:00Z');
    const suspendedAt = at('2026-02-01T00:00:00Z');

    it('suspendByOperator raises SubscriptionSuspended with purgeAt 90 days out for a never-paid tenant', () => {
      const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();

      expect(subscription.suspendByOperator(now, 'corr-9')).toBe(true);

      expect(subscription.domainEvents).toHaveLength(1);
      expect(subscription.domainEvents[0]).toMatchObject({
        eventName: 'SubscriptionSuspended',
        tenantId: subscription.tenantId,
        correlationId: 'corr-9',
        data: {
          subscriptionId: subscription.id,
          reason: 'OPERATOR',
          suspendedAt: now.toISOString(),
          purgeAt: at('2026-05-30T12:00:00Z').toISOString(),
        },
      });
    });

    it('suspendByOperator puts purgeAt 180 days out for a tenant that paid', () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withHasEverPaid(true)
        .build();

      subscription.suspendByOperator(now, 'corr-9');

      expect(subscription.domainEvents[0]?.data).toMatchObject({
        purgeAt: at('2026-08-28T12:00:00Z').toISOString(),
      });
    });

    it('suspendByOperator reports no change and raises nothing when already OPERATOR-suspended', () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('OPERATOR', suspendedAt)
        .build();

      expect(subscription.suspendByOperator(now, 'corr-9')).toBe(false);
      expect(subscription.domainEvents).toEqual([]);
    });

    it('suspendByOperator on a payment suspension reports no change and raises nothing', () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('NON_PAYMENT', suspendedAt)
        .build();

      expect(subscription.suspendByOperator(now, 'corr-9')).toBe(false);
      expect(subscription.domainEvents).toEqual([]);
    });

    it('unsuspendOperator raises SubscriptionReactivated carrying the span start it cleared', () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('OPERATOR', suspendedAt)
        .build();

      subscription.unsuspendOperator(now, 'corr-9');

      expect(subscription.suspendedAt).toBeNull();
      expect(subscription.domainEvents).toHaveLength(1);
      expect(subscription.domainEvents[0]).toMatchObject({
        eventName: 'SubscriptionReactivated',
        correlationId: 'corr-9',
        data: {
          subscriptionId: subscription.id,
          reactivatedAt: now.toISOString(),
          suspendedAt: suspendedAt.toISOString(),
        },
      });
    });

    it('setExempt on a suspended subscription raises SubscriptionReactivated with the span start', () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('NON_PAYMENT', suspendedAt)
        .build();

      expect(subscription.setExempt(now, 'Ana', 'corr-9')).toBe(true);

      expect(subscription.domainEvents).toHaveLength(1);
      expect(subscription.domainEvents[0]?.data).toMatchObject({
        suspendedAt: suspendedAt.toISOString(),
        reactivatedAt: now.toISOString(),
      });
    });

    it('setExempt on a running subscription raises nothing, and an already-exempt one reports no change', () => {
      const running = new SubscriptionBuilder().withStatus('TRIALING').build();
      const exempt = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();

      expect(running.setExempt(now, 'Ana', 'corr-9')).toBe(true);
      expect(running.domainEvents).toEqual([]);
      expect(exempt.setExempt(now, 'Ana', 'corr-9')).toBe(false);
      expect(exempt.domainEvents).toEqual([]);
    });

    it('clearExempt and extendGrace report whether anything changed', () => {
      const exempt = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();
      const paying = new SubscriptionBuilder().withStatus('ACTIVE').build();
      const pastDue = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withPastDueSince(at('2026-02-01T00:00:00Z'))
        .build();
      const until = at('2026-03-20T00:00:00Z');

      expect(exempt.clearExempt(now, 'Ana', false)).toBe(true);
      expect(paying.clearExempt(now, 'Ana', false)).toBe(false);
      expect(pastDue.extendGrace(until)).toBe(true);
      expect(pastDue.extendGrace(until)).toBe(false);
    });
  });
});
