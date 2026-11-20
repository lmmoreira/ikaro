import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { createIssueHarness } from '../../../../test/infrastructure/billing-issue-harness';
import { BILLING_JOB_PAGE_SIZE } from '../../domain/billing-constants';
import type { Subscription } from '../../domain/subscription.aggregate';

// The harness clock is 12:00 São Paulo on 2026-03-10: the lead reaches 03-20, the query's slack 03-21.
describe('IssueNextChargesJob (UC-113)', () => {
  let h: ReturnType<typeof createIssueHarness>;

  beforeEach(() => {
    h = createIssueHarness();
  });

  const subscriptionDue = (nextDueDate: string): Subscription =>
    new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withAnchorDay(20)
      .withNextDueDate(nextDueDate)
      .withItems([h.hotsiteItem()])
      .build();

  const run = () => h.issueNext.run({ correlationId: 'corr-1' });
  const chargesOf = (subscription: Subscription) =>
    h.charges.saved.filter((charge) => charge.tenantId === subscription.tenantId);

  it('issues every due subscription for its own tenant, and nobody else', async () => {
    const dueA = subscriptionDue('2026-03-20');
    const dueB = subscriptionDue('2026-03-15');
    const later = subscriptionDue('2026-03-22');
    for (const subscription of [dueA, dueB, later]) await h.seedTenant(subscription);

    const result = await run();

    expect(result).toMatchObject({ selected: 2, outcomes: { ISSUED: 2 } });
    expect(chargesOf(dueA)).toHaveLength(1);
    expect(chargesOf(dueB)).toHaveLength(1);
    expect(chargesOf(later)).toHaveLength(0);
    expect(chargesOf(dueA)[0].tenantId).toBe(dueA.tenantId);
    expect(chargesOf(dueB)[0].tenantId).toBe(dueB.tenantId);
  });

  it('selects with a day of slack but issues only what is due in the subscription’s own zone', async () => {
    const edge = subscriptionDue('2026-03-21');
    await h.seedTenant(edge);

    const result = await run();

    expect(result).toMatchObject({ selected: 1, outcomes: { NOT_DUE: 1 } });
    expect(chargesOf(edge)).toHaveLength(0);
  });

  it('a zone a day ahead of UTC is selected and invoiced on its local date', async () => {
    // 15:00Z on 2026-03-10 is already 2026-03-11 in Auckland: a due date of 03-21 is 10 days away
    // there, but 11 days away by the UTC date, so only the one day of slack in the selection reaches it.
    const ahead = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withTimezone('Pacific/Auckland')
      .withAnchorDay(20)
      .withNextDueDate('2026-03-21')
      .withItems([h.hotsiteItem()])
      .build();
    await h.seedTenant(ahead);

    const result = await run();

    expect(result).toMatchObject({ selected: 1, outcomes: { ISSUED: 1 } });
    expect(chargesOf(ahead)).toHaveLength(1);
  });

  it('running twice issues once', async () => {
    const due = subscriptionDue('2026-03-20');
    await h.seedTenant(due);

    await run();
    const second = await run();

    expect(second).toMatchObject({ selected: 0 });
    expect(chargesOf(due)).toHaveLength(1);
  });

  it('one subscription that fails does not stop the others, the retry still runs, and the run fails once at the end', async () => {
    // A charge left PENDING by an earlier failed creation, for the retry phase to pick up.
    const stuck = subscriptionDue('2026-03-12');
    await h.seedTenant(stuck);
    h.provider.failNextCall('UNAVAILABLE');
    await h.issueOne.execute({ tenantId: stuck.tenantId, correlationId: 'seed' });
    h.clock.advanceMs(11 * 60_000);
    const broken = subscriptionDue('2026-03-18');
    const healthy = subscriptionDue('2026-03-20');
    await h.seedTenant(broken);
    await h.seedTenant(healthy);
    // The oldest due date is first in line, so the Platform lookup that fails is the broken one's.
    h.platform.failNext(new Error('platform down'));

    await expect(run()).rejects.toThrow('1 subscriptions failed to issue');

    expect(chargesOf(healthy)).toHaveLength(1);
    expect(chargesOf(broken)).toHaveLength(0);
    expect(chargesOf(stuck)[0].providerCreationStatus).toBe('READY');
  });

  it('pages through every due subscription, not just the first page', async () => {
    const subscriptions = Array.from({ length: BILLING_JOB_PAGE_SIZE + 1 }, () =>
      subscriptionDue('2026-03-20'),
    );
    for (const subscription of subscriptions) await h.seedTenant(subscription);

    const result = await run();

    expect(result).toMatchObject({
      selected: BILLING_JOB_PAGE_SIZE + 1,
      outcomes: { ISSUED: BILLING_JOB_PAGE_SIZE + 1 },
    });
    expect(h.charges.saved).toHaveLength(BILLING_JOB_PAGE_SIZE + 1);
  });

  it('a page of subscriptions that stay due (held identity) never starves a healthy one behind them', async () => {
    // Earlier due dates sort first: with a head-only selection, a full page of held subscriptions
    // would be returned again and again and the healthy one would never be reached.
    for (let i = 0; i < BILLING_JOB_PAGE_SIZE; i++) {
      await h.seedTenant(subscriptionDue('2026-03-05'), { billable: false });
    }
    const healthy = subscriptionDue('2026-03-20');
    await h.seedTenant(healthy);

    const result = await run();

    expect(result.outcomes).toEqual({ HELD: BILLING_JOB_PAGE_SIZE, ISSUED: 1 });
    expect(chargesOf(healthy)).toHaveLength(1);
  });
});
