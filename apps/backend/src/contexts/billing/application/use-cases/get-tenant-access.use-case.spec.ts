import { FEATURE_KEYS } from '@ikaro/validation';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { SubscriptionBuilder, SubscriptionItemBuilder } from '../../../../test/builders/billing';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';
import { GetTenantAccessUseCase, PROVISIONING_GRACE_MINUTES } from './get-tenant-access.use-case';

// Relative to the real clock, like SubscriptionItemBuilder's default start (a day before Date.now()):
// a hardcoded instant puts that start in the spec clock's future as soon as real time passes it.
const NOW = new Date();
const MINUTE_MS = 60_000;

describe('GetTenantAccessUseCase', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let platform: InMemoryBillingPlatformPort;
  let clock: AdvanceableClock;
  let useCase: GetTenantAccessUseCase;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    platform = new InMemoryBillingPlatformPort();
    clock = new AdvanceableClock(NOW);
    useCase = new GetTenantAccessUseCase(subscriptions, platform, clock);
  });

  const seedTenantAged = (tenantId: string, minutesOld: number): void => {
    platform.seed({
      tenantId,
      slug: 'lavacar',
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt: new Date(NOW.getTime() - minutesOld * MINUTE_MS),
      isActive: true,
    });
  };

  describe('a tenant with a subscription', () => {
    it('is operational with every feature while TRIALING', async () => {
      const subscription = new SubscriptionBuilder().withStatus('TRIALING').build();
      await subscriptions.save(subscription);

      const access = await useCase.execute({ tenantId: subscription.tenantId });

      expect(access.status).toBe('TRIALING');
      expect(access.operational).toBe(true);
      expect(access.features.map((feature) => feature.key).sort()).toEqual(
        [...FEATURE_KEYS].sort(),
      );
      expect(access.features.find((feature) => feature.key === 'CHATBOT')?.tier).toBe('BASIC');
    });

    it('is not operational and has no features when SUSPENDED, and carries the reason', async () => {
      const subscription = new SubscriptionBuilder()
        .withSuspension('NON_PAYMENT', new Date(NOW.getTime() - 1000))
        .withItems([new SubscriptionItemBuilder().withFeatureKey('HOTSITE').build()])
        .build();
      await subscriptions.save(subscription);

      const access = await useCase.execute({ tenantId: subscription.tenantId });

      expect(access).toEqual({
        status: 'SUSPENDED',
        suspensionReason: 'NON_PAYMENT',
        operational: false,
        features: [],
      });
    });

    it('is operational with exactly its active items when exempt (ACTIVE)', async () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withExempt(true)
        .withItems([
          new SubscriptionItemBuilder().withFeatureKey('HOTSITE').build(),
          new SubscriptionItemBuilder().withFeatureKey('BOOKING').build(),
        ])
        .build();
      await subscriptions.save(subscription);

      const access = await useCase.execute({ tenantId: subscription.tenantId });

      expect(access.operational).toBe(true);
      expect(access.features.map((feature) => feature.key).sort()).toEqual(['BOOKING', 'HOTSITE']);
    });

    it('stays operational while PAST_DUE', async () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('PAST_DUE')
        .withItems([new SubscriptionItemBuilder().withFeatureKey('HOTSITE').build()])
        .build();
      await subscriptions.save(subscription);

      const access = await useCase.execute({ tenantId: subscription.tenantId });

      expect(access.status).toBe('PAST_DUE');
      expect(access.operational).toBe(true);
    });

    it('reads the items active at the clock time, not at the moment the subscription was built', async () => {
      const subscription = new SubscriptionBuilder()
        .withStatus('ACTIVE')
        .withItems([
          new SubscriptionItemBuilder()
            .withFeatureKey('HOTSITE')
            .withStartsAt(new Date(NOW.getTime() - 10 * MINUTE_MS))
            .withEndsAt(new Date(NOW.getTime() + 5 * MINUTE_MS))
            .build(),
        ])
        .build();
      await subscriptions.save(subscription);

      const before = await useCase.execute({ tenantId: subscription.tenantId });
      clock.advanceMs(6 * MINUTE_MS);
      const after = await useCase.execute({ tenantId: subscription.tenantId });

      expect(before.features).toHaveLength(1);
      expect(after.features).toHaveLength(0);
    });

    it('never marks a real answer as provisional or degraded', async () => {
      const subscription = new SubscriptionBuilder().build();
      await subscriptions.save(subscription);

      const access = await useCase.execute({ tenantId: subscription.tenantId });

      expect(access).not.toHaveProperty('provisional');
      expect(access).not.toHaveProperty('degraded');
    });

    describe('the BOOKING cap (M26-S18b)', () => {
      const DAY_MS = 24 * 60 * MINUTE_MS;
      const TIMEZONE = 'America/Sao_Paulo';
      const startedAgo = new Date(NOW.getTime() - 10 * MINUTE_MS);
      const bookingItem = (endsAt: Date | null) =>
        new SubscriptionItemBuilder()
          .withFeatureKey('BOOKING')
          .withStartsAt(startedAgo)
          .withEndsAt(endsAt)
          .build();

      it('carries bookableUntil, in the subscription timezone, for an ACTIVE subscription with a pending BOOKING removal', async () => {
        const endsAt = new Date(NOW.getTime() + 5 * DAY_MS);
        const subscription = new SubscriptionBuilder()
          .withStatus('ACTIVE')
          .withTimezone(TIMEZONE)
          .withItems([bookingItem(endsAt)])
          .build();
        await subscriptions.save(subscription);

        const access = await useCase.execute({ tenantId: subscription.tenantId });

        expect(access.bookableUntil).toBe(utcDateToLocalDate(endsAt, TIMEZONE));
        expect(access.features.map((feature) => feature.key)).toEqual(['BOOKING']);
      });

      it('carries bookableUntil for a TRIALING subscription whose paid items omit BOOKING', async () => {
        const trialEndsAt = new Date(NOW.getTime() + 3 * DAY_MS);
        const subscription = new SubscriptionBuilder()
          .withStatus('TRIALING')
          .withTimezone(TIMEZONE)
          .withTrialEndsAt(trialEndsAt)
          .withItems([
            new SubscriptionItemBuilder()
              .withFeatureKey('HOTSITE')
              .withStartsAt(trialEndsAt)
              .withEndsAt(null)
              .build(),
          ])
          .build();
        await subscriptions.save(subscription);

        const access = await useCase.execute({ tenantId: subscription.tenantId });

        expect(access.bookableUntil).toBe(utcDateToLocalDate(trialEndsAt, TIMEZONE));
        // The trial still grants every feature, BOOKING included.
        expect(access.features.some((feature) => feature.key === 'BOOKING')).toBe(true);
      });

      it('has no bookableUntil key for an ACTIVE subscription whose BOOKING item is open-ended', async () => {
        const subscription = new SubscriptionBuilder()
          .withStatus('ACTIVE')
          .withItems([bookingItem(null)])
          .build();
        await subscriptions.save(subscription);

        const access = await useCase.execute({ tenantId: subscription.tenantId });

        expect(access).not.toHaveProperty('bookableUntil');
      });

      it('has no bookableUntil key when a successor item keeps BOOKING from the same instant', async () => {
        const handover = new Date(NOW.getTime() + 5 * DAY_MS);
        const subscription = new SubscriptionBuilder()
          .withStatus('ACTIVE')
          .withItems([
            bookingItem(handover),
            new SubscriptionItemBuilder()
              .withFeatureKey('BOOKING')
              .withStartsAt(handover)
              .withEndsAt(null)
              .build(),
          ])
          .build();
        await subscriptions.save(subscription);

        const access = await useCase.execute({ tenantId: subscription.tenantId });

        expect(access).not.toHaveProperty('bookableUntil');
      });

      it('has no bookableUntil key for a TRIALING subscription whose paid items keep BOOKING', async () => {
        const trialEndsAt = new Date(NOW.getTime() + 3 * DAY_MS);
        const subscription = new SubscriptionBuilder()
          .withStatus('TRIALING')
          .withTrialEndsAt(trialEndsAt)
          .withItems([
            new SubscriptionItemBuilder()
              .withFeatureKey('BOOKING')
              .withStartsAt(trialEndsAt)
              .withEndsAt(null)
              .build(),
          ])
          .build();
        await subscriptions.save(subscription);

        const access = await useCase.execute({ tenantId: subscription.tenantId });

        expect(access).not.toHaveProperty('bookableUntil');
      });

      it('has no bookableUntil key for a SUSPENDED subscription, whatever its items say', async () => {
        const subscription = new SubscriptionBuilder()
          .withSuspension('NON_PAYMENT', new Date(NOW.getTime() - 1000))
          .withItems([bookingItem(new Date(NOW.getTime() + 5 * DAY_MS))])
          .build();
        await subscriptions.save(subscription);

        const access = await useCase.execute({ tenantId: subscription.tenantId });

        expect(access.status).toBe('SUSPENDED');
        expect(access).not.toHaveProperty('bookableUntil');
      });

      it('reads the removal at the clock time: once the item has ended there is no cap left to carry', async () => {
        const endsAt = new Date(NOW.getTime() + 5 * MINUTE_MS);
        const subscription = new SubscriptionBuilder()
          .withStatus('ACTIVE')
          .withItems([bookingItem(endsAt)])
          .build();
        await subscriptions.save(subscription);

        const before = await useCase.execute({ tenantId: subscription.tenantId });
        clock.advanceMs(6 * MINUTE_MS);
        const after = await useCase.execute({ tenantId: subscription.tenantId });

        expect(before).toHaveProperty('bookableUntil');
        expect(after).not.toHaveProperty('bookableUntil');
      });
    });
  });

  describe('a successfully read missing subscription (UC-120 A1)', () => {
    it('allows a tenant 14 minutes old as a pending trial, with the provisional TRIALING-shaped answer', async () => {
      const tenantId = uuidv7();
      seedTenantAged(tenantId, PROVISIONING_GRACE_MINUTES - 1);

      const access = await useCase.execute({ tenantId });

      expect(access.operational).toBe(true);
      expect(access.status).toBe('TRIALING');
      expect(access.suspensionReason).toBeNull();
      expect(access.provisional).toBe(true);
      expect(access.features.map((feature) => feature.key).sort()).toEqual(
        [...FEATURE_KEYS].sort(),
      );
      expect(access.features.find((feature) => feature.key === 'CHATBOT')?.tier).toBe('BASIC');
      expect(access).not.toHaveProperty('degraded');
    });

    it('denies a tenant 16 minutes old', async () => {
      const tenantId = uuidv7();
      seedTenantAged(tenantId, PROVISIONING_GRACE_MINUTES + 1);

      const access = await useCase.execute({ tenantId });

      expect(access.operational).toBe(false);
      expect(access.features).toEqual([]);
      expect(access).not.toHaveProperty('provisional');
      expect(access).not.toHaveProperty('degraded');
    });

    it('denies exactly at the end of the window', async () => {
      const tenantId = uuidv7();
      seedTenantAged(tenantId, PROVISIONING_GRACE_MINUTES);

      await expect(useCase.execute({ tenantId })).resolves.toMatchObject({ operational: false });
    });

    it("does not return another tenant's suspension for a tenant without a subscription", async () => {
      const tenantA = new SubscriptionBuilder()
        .withSuspension('NON_PAYMENT', new Date(NOW.getTime() - 1000))
        .build();
      await subscriptions.save(tenantA);
      const tenantB = uuidv7();
      seedTenantAged(tenantB, PROVISIONING_GRACE_MINUTES + 1);

      const access = await useCase.execute({ tenantId: tenantB });

      expect(access.suspensionReason).toBeNull();
      expect(access.operational).toBe(false);
    });

    it('throws a typed not-found, never fails open, for a tenant that does not exist', async () => {
      await expect(useCase.execute({ tenantId: uuidv7() })).rejects.toBeInstanceOf(
        BillingTenantNotFoundError,
      );
    });
  });

  describe('a transient lookup error', () => {
    it('fails open when the subscription read fails, marked degraded', async () => {
      subscriptions.failNextFind(new Error('connection reset'));

      const access = await useCase.execute({ tenantId: uuidv7() });

      expect(access.operational).toBe(true);
      expect(access.status).toBe('ACTIVE');
      expect(access.degraded).toBe(true);
      expect(access.suspensionReason).toBeNull();
      expect(access.features.map((feature) => feature.key).sort()).toEqual(
        [...FEATURE_KEYS].sort(),
      );
      expect(access.features.find((feature) => feature.key === 'CHATBOT')?.tier).toBe('BASIC');
      expect(access).not.toHaveProperty('provisional');
    });

    it('fails open when the tenant-info read fails (a missing subscription, then a lookup error)', async () => {
      platform.failNext(new Error('platform timeout'));

      const access = await useCase.execute({ tenantId: uuidv7() });

      expect(access.operational).toBe(true);
      expect(access.degraded).toBe(true);
    });
  });
});
