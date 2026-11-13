import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { PlatformAdminGuard } from '../../../../shared/guards/platform-admin.guard';
import { SubscriptionBuilder } from '../../../../test/builders/billing';
import { AdvanceableClock } from '../../../../test/infrastructure/advanceable-clock';
import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryOperatorAuditRepository } from '../../../../test/repositories/billing/in-memory-operator-audit.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { ExtendGraceUseCase } from '../../application/use-cases/extend-grace.use-case';
import { ListTenantBillingStatusUseCase } from '../../application/use-cases/list-tenant-billing-status.use-case';
import { SetTenantExemptUseCase } from '../../application/use-cases/set-tenant-exempt.use-case';
import { SuspendTenantByOperatorUseCase } from '../../application/use-cases/suspend-tenant-by-operator.use-case';
import { UnsuspendTenantUseCase } from '../../application/use-cases/unsuspend-tenant.use-case';
import { InternalBillingOperatorController } from './internal-billing-operator.controller';

const NOW = new Date('2026-11-12T12:00:00.000Z');
const CORRELATION_ID = '0197b0a0-0000-7000-8000-0000000000c1';
const BODY = { operator: 'Ana Souza', reason: 'abuse report' };

describe('InternalBillingOperatorController', () => {
  let subscriptions: InMemorySubscriptionRepository;
  let controller: InternalBillingOperatorController;

  beforeEach(() => {
    subscriptions = new InMemorySubscriptionRepository();
    const audits = new InMemoryOperatorAuditRepository();
    const tx = new InMemoryTransactionManager();
    const clock = new AdvanceableClock(NOW);
    controller = new InternalBillingOperatorController(
      new SuspendTenantByOperatorUseCase(subscriptions, audits, tx, clock),
      new UnsuspendTenantUseCase(subscriptions, audits, tx, clock),
      new ExtendGraceUseCase(subscriptions, audits, tx, clock),
      new SetTenantExemptUseCase(
        subscriptions,
        audits,
        tx,
        clock,
        new InMemoryBillingPlatformPort(),
        {
          appEnv: 'local',
          platformOwnerSlug: null,
        },
      ),
      new ListTenantBillingStatusUseCase(subscriptions),
    );
  });

  it('carries InternalApiGuard and PlatformAdminGuard on every route', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      InternalBillingOperatorController,
    ) as unknown[];

    expect(guards).toEqual([InternalApiGuard, PlatformAdminGuard]);
  });

  it('suspend answers the state after the action', async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
    await subscriptions.save(subscription);

    await expect(
      controller.suspend(subscription.tenantId, BODY, CORRELATION_ID),
    ).resolves.toMatchObject({
      status: 'SUSPENDED',
      suspensionReason: 'OPERATOR',
    });
  });

  it('suspend of an exempt tenant is a 403 through the error mapper', async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build();
    await subscriptions.save(subscription);

    await expect(
      controller.suspend(subscription.tenantId, BODY, CORRELATION_ID),
    ).rejects.toMatchObject({
      status: 403,
    });
  });

  it('unsuspend of a payment-based suspension is a 409 through the error mapper', async () => {
    const subscription = new SubscriptionBuilder()
      .withSuspension('NON_PAYMENT', new Date('2026-11-01T00:00:00.000Z'))
      .build();
    await subscriptions.save(subscription);

    await expect(
      controller.unsuspend(subscription.tenantId, BODY, CORRELATION_ID),
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  it('grace on a tenant that is not PAST_DUE is a 409 through the error mapper', async () => {
    const subscription = new SubscriptionBuilder().withStatus('ACTIVE').build();
    await subscriptions.save(subscription);

    await expect(
      controller.grace(subscription.tenantId, { ...BODY, graceUntil: '2026-12-01T00:00:00.000Z' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('exempt sets free access', async () => {
    const subscription = new SubscriptionBuilder().withStatus('TRIALING').build();
    await subscriptions.save(subscription);

    await expect(
      controller.exempt(subscription.tenantId, { ...BODY, exempt: true }, CORRELATION_ID),
    ).resolves.toMatchObject({ status: 'ACTIVE', exempt: true });
  });

  it('an unknown tenant is a 404 through the error mapper', async () => {
    await expect(
      controller.suspend('0197b0a0-0000-7000-8000-000000000001', BODY, CORRELATION_ID),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('list returns the paginated page', async () => {
    await subscriptions.save(new SubscriptionBuilder().withStatus('ACTIVE').build());

    const page = await controller.list({ limit: 25, offset: 0 });

    expect(page.pagination.total).toBe(1);
  });
});
