import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { utcDateToLocalDate } from '../../../../shared/utils/calendar-date';
import { SubscriptionBuilder, SubscriptionItemBuilder } from '../../../../test/builders/billing';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { GetBookableUntilUseCase } from './get-bookable-until.use-case';

// Relative to the real clock, like SubscriptionItemBuilder's default start (a day before Date.now()).
const NOW = new Date();
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const TIMEZONE = 'America/Sao_Paulo';

describe('GetBookableUntilUseCase', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let clock: AdvanceableClock;
  let useCase: GetBookableUntilUseCase;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    clock = new AdvanceableClock(NOW);
    useCase = new GetBookableUntilUseCase(subscriptions, clock);
  });

  const bookingItem = (endsAt: Date | null) =>
    new SubscriptionItemBuilder()
      .withFeatureKey('BOOKING')
      .withStartsAt(new Date(NOW.getTime() - 10 * MINUTE_MS))
      .withEndsAt(endsAt)
      .build();

  it('returns the tenant-local date of a pending BOOKING removal', async () => {
    const endsAt = new Date(NOW.getTime() + 5 * DAY_MS);
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withTimezone(TIMEZONE)
      .withItems([bookingItem(endsAt)])
      .build();
    await subscriptions.save(subscription);

    await expect(useCase.execute({ tenantId: subscription.tenantId })).resolves.toEqual({
      bookableUntil: utcDateToLocalDate(endsAt, TIMEZONE),
    });
  });

  it('returns the trial end date for a trial whose paid items omit BOOKING', async () => {
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

    await expect(useCase.execute({ tenantId: subscription.tenantId })).resolves.toEqual({
      bookableUntil: utcDateToLocalDate(trialEndsAt, TIMEZONE),
    });
  });

  it('returns null when no removal is pending', async () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([bookingItem(null)])
      .build();
    await subscriptions.save(subscription);

    await expect(useCase.execute({ tenantId: subscription.tenantId })).resolves.toEqual({
      bookableUntil: null,
    });
  });

  it('returns null for a SUSPENDED subscription', async () => {
    const subscription = new SubscriptionBuilder()
      .withSuspension('NON_PAYMENT', new Date(NOW.getTime() - 1000))
      .withItems([bookingItem(new Date(NOW.getTime() + 5 * DAY_MS))])
      .build();
    await subscriptions.save(subscription);

    await expect(useCase.execute({ tenantId: subscription.tenantId })).resolves.toEqual({
      bookableUntil: null,
    });
  });

  it('returns null for a tenant with no subscription, never an error', async () => {
    await expect(useCase.execute({ tenantId: uuidv7() })).resolves.toEqual({
      bookableUntil: null,
    });
  });

  it('keeps answering the boundary once the item has ended, so a write that passed the gate just before it is still refused', async () => {
    const endsAt = new Date(NOW.getTime() + 5 * MINUTE_MS);
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([bookingItem(endsAt)])
      .build();
    await subscriptions.save(subscription);

    const before = await useCase.execute({ tenantId: subscription.tenantId });
    clock.advanceMs(6 * MINUTE_MS);
    const after = await useCase.execute({ tenantId: subscription.tenantId });

    expect(before.bookableUntil).not.toBeNull();
    expect(after.bookableUntil).toBe(before.bookableUntil);
  });

  it("is scoped by tenant: another tenant's removal is never returned", async () => {
    const other = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([bookingItem(new Date(NOW.getTime() + 5 * DAY_MS))])
      .build();
    await subscriptions.save(other);

    await expect(useCase.execute({ tenantId: uuidv7() })).resolves.toEqual({
      bookableUntil: null,
    });
  });

  it('reads through findFreshByTenantId and never the cached findByTenantId', async () => {
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withItems([bookingItem(new Date(NOW.getTime() + 5 * DAY_MS))])
      .build();
    await subscriptions.save(subscription);
    const fresh = jest.spyOn(subscriptions, 'findFreshByTenantId');
    const cached = jest.spyOn(subscriptions, 'findByTenantId');

    await useCase.execute({ tenantId: subscription.tenantId });

    expect(fresh).toHaveBeenCalledTimes(1);
    expect(fresh).toHaveBeenCalledWith(subscription.tenantId);
    expect(cached).not.toHaveBeenCalled();
  });

  it('propagates a repository error, never failing open', async () => {
    const failure = new Error('connection reset');
    jest.spyOn(subscriptions, 'findFreshByTenantId').mockRejectedValue(failure);

    await expect(useCase.execute({ tenantId: uuidv7() })).rejects.toBe(failure);
  });
});
