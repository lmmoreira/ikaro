import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import {
  createSelfHealHarness,
  SWEEP_NOW,
} from '../../../../test/infrastructure/billing-self-heal-harness';
import { BILLING_JOB_PAGE_SIZE } from '../../domain/billing-constants';
import { PROVISIONING_GRACE_MINUTES } from '../use-cases/get-tenant-access.use-case';

const minutesBefore = (minutes: number): Date => new Date(SWEEP_NOW.getTime() - minutes * 60_000);

describe('RepairMissingSubscriptionsStep (UC-140 step 1)', () => {
  let h: ReturnType<typeof createSelfHealHarness>;

  beforeEach(() => {
    h = createSelfHealHarness();
  });

  const seedTenant = (
    options: { createdAt?: Date; isActive?: boolean; countryCode?: string; timezone?: string } = {},
  ): string => {
    const tenantId = uuidv7();
    h.platform.seed({
      tenantId,
      slug: `tenant-${tenantId.slice(-8)}`,
      countryCode: options.countryCode ?? 'BR',
      timezone: options.timezone ?? 'America/Manaus',
      createdAt: options.createdAt ?? minutesBefore(PROVISIONING_GRACE_MINUTES + 5),
      isActive: options.isActive ?? true,
    });
    return tenantId;
  };

  const run = () => h.repair.execute({ now: h.clock.now(), correlationId: 'corr-1' });

  it('creates the trial of a tenant older than the window that has no subscription', async () => {
    const tenantId = seedTenant();

    const result = await run();

    expect(result).toMatchObject({ scanned: 1, repaired: 1, failed: 0, truncated: false });
    const subscription = await h.subscriptions.findByTenantId(tenantId);
    expect(subscription?.status).toBe('TRIALING');
  });

  it("starts the repaired trial now (a full trial) in the tenant's own country and timezone, never at its creation", async () => {
    const tenantId = seedTenant({
      createdAt: minutesBefore(60 * 24 * 10),
      timezone: 'America/Manaus',
    });

    await run();

    const subscription = await h.subscriptions.findByTenantId(tenantId);
    expect(subscription?.timezone.value).toBe('America/Manaus');
    expect(subscription?.currency).toBe('BRL');
    // A trial started at the tenant's creation (10 days ago) would already be partly spent.
    const daysLeft =
      ((subscription?.trialEndsAt?.getTime() ?? 0) - SWEEP_NOW.getTime()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(13);
    expect(daysLeft).toBeLessThanOrEqual(15);
  });

  it('calls CreateTrialSubscriptionUseCase with no adminEmail, registrationId or eventId and no billing email', async () => {
    const tenantId = seedTenant();
    const spy = jest.spyOn(h.createTrial, 'execute');

    await run();

    const input = spy.mock.calls[0][0];
    expect(input).toMatchObject({ tenantId, occurredAt: SWEEP_NOW.toISOString() });
    expect(input).not.toHaveProperty('adminEmail');
    expect(input).not.toHaveProperty('registrationId');
    expect(input).not.toHaveProperty('eventId');
    expect((await h.accounts.findByTenantId(tenantId))?.billingEmail ?? null).toBeNull();
  });

  it('skips a tenant younger than the provisioning window', async () => {
    seedTenant({ createdAt: minutesBefore(PROVISIONING_GRACE_MINUTES - 1) });

    const result = await run();

    expect(result).toMatchObject({ scanned: 0, repaired: 0 });
    expect(h.subscriptions.saved).toHaveLength(0);
  });

  it('skips an inactive tenant and counts it, never repairing it', async () => {
    seedTenant({ isActive: false });

    const result = await run();

    expect(result).toMatchObject({ scanned: 1, repaired: 0, skippedInactive: 1 });
    expect(h.subscriptions.saved).toHaveLength(0);
  });

  it('leaves a tenant that already has a subscription alone (idempotent across runs)', async () => {
    const withSubscription = seedTenant();
    await h.subscriptions.save(new SubscriptionBuilder().withTenantId(withSubscription).build());
    const missing = seedTenant();

    const first = await run();
    const second = await run();

    expect(first.repaired).toBe(1);
    expect(second.repaired).toBe(0);
    expect(h.subscriptions.saved.map((s) => s.tenantId).sort()).toEqual(
      [withSubscription, missing].sort(),
    );
  });

  it('reaches a subscription-less tenant that sits beyond the first page', async () => {
    for (let i = 0; i < BILLING_JOB_PAGE_SIZE; i += 1) {
      const tenantId = seedTenant({ createdAt: minutesBefore(1000 + BILLING_JOB_PAGE_SIZE - i) });
      await h.subscriptions.save(new SubscriptionBuilder().withTenantId(tenantId).build());
    }
    const lastTenant = seedTenant({ createdAt: minutesBefore(30) });

    const result = await run();

    expect(result.repaired).toBe(1);
    expect(await h.subscriptions.findByTenantId(lastTenant)).not.toBeNull();
  });

  it("keeps going past one tenant's failure, logs it, and reports every failure", async () => {
    const bad = seedTenant({ createdAt: minutesBefore(60) });
    const good = seedTenant({ createdAt: minutesBefore(30) });
    const real = h.createTrial.execute.bind(h.createTrial);
    jest.spyOn(h.createTrial, 'execute').mockImplementation(async (input) => {
      if (input.tenantId === bad) throw new Error('no price list');
      return real(input);
    });

    const result = await run();

    expect(result).toMatchObject({ repaired: 1, failed: 1 });
    expect(result.failures).toHaveLength(1);
    expect(await h.subscriptions.findByTenantId(good)).not.toBeNull();
    expect(await h.subscriptions.findByTenantId(bad)).toBeNull();
  });
});
