import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { NO_FEATURE_GATE_KEY, SUSPENSION_ACCESS_KEY } from '@ikaro/nestjs-http';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { RequestContext } from '../../../../shared/request/request-context';
import { ChargeBuilder } from '../../../../test/builders/billing';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryBillingAccountRepository } from '../../../../test/repositories/billing/in-memory-billing-account.repository';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { InMemorySubscriptionRepository } from '../../../../test/repositories/billing/in-memory-subscription.repository';
import { GetBillingSummaryUseCase } from '../../application/use-cases/get-billing-summary.use-case';
import { GetPlanCatalogUseCase } from '../../application/use-cases/get-plan-catalog.use-case';
import { ListBillingChargesUseCase } from '../../application/use-cases/list-billing-charges.use-case';
import { PreviewPlanSelectionUseCase } from '../../application/use-cases/preview-plan-selection.use-case';
import { BillingController } from './billing.controller';

const TENANT_ID = '0197b0a0-0000-7000-8000-0000000000a1';
const OTHER_TENANT_ID = '0197b0a0-0000-7000-8000-0000000000b2';

// The controller is wired to the real use cases over in-memory repositories: what it returns is
// what the manager would get, not what a mock was told to say.
describe('BillingController', () => {
  const reflector = new Reflector();
  const context = { tenantId: TENANT_ID } as RequestContext;
  let charges: InMemoryChargeRepository;
  let controller: BillingController;

  beforeEach(() => {
    charges = new InMemoryChargeRepository();
    const subscriptions = new InMemorySubscriptionRepository();
    const prices = new InMemoryFeaturePriceRepository();
    const clock = new FixedClock(new Date('2026-11-12T15:00:00.000Z'));
    controller = new BillingController(
      new GetBillingSummaryUseCase(
        subscriptions,
        new InMemoryBillingAccountRepository(),
        charges,
        prices,
        clock,
      ),
      new ListBillingChargesUseCase(charges),
      new GetPlanCatalogUseCase(subscriptions, charges, prices, clock),
      new PreviewPlanSelectionUseCase(subscriptions, charges, prices, clock),
      context,
    );
  });

  describe('tenant-access metadata (the routes a suspended manager must reach)', () => {
    it('declares the manager-billing suspension policy and skips the entitlement gate on the class', () => {
      expect(reflector.get(SUSPENSION_ACCESS_KEY, BillingController)).toBe('MANAGER_BILLING');
      expect(reflector.get(NO_FEATURE_GATE_KEY, BillingController)).toBe(true);
    });

    it('guards every route with the manager role guard', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, BillingController)).toEqual([ManagerRoleGuard]);
    });
  });

  it('answers the summary of the caller’s own tenant, provisioning when it has no subscription', async () => {
    await expect(controller.summary()).resolves.toEqual({ provisioning: true });
  });

  it('answers the plan of the caller’s own tenant, provisioning when it has no subscription', async () => {
    await expect(controller.plan()).resolves.toEqual({ provisioning: true });
  });

  it('answers a plan preview for a tenant with no subscription as not found, through the error mapper', async () => {
    await expect(
      controller.previewPlan({ items: [{ featureKey: 'HOTSITE', tier: 'STANDARD' }] }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('lists the caller’s own charges for the requested page, never another tenant’s', async () => {
    const september = new ChargeBuilder()
      .withTenantId(TENANT_ID)
      .withPeriod('2026-09-01', '2026-09-30')
      .withDueDate('2026-09-10')
      .build();
    const october = new ChargeBuilder()
      .withTenantId(TENANT_ID)
      .withPeriod('2026-10-01', '2026-10-31')
      .withDueDate('2026-10-10')
      .build();
    for (const charge of [september, october]) await charges.save(charge);
    await charges.save(new ChargeBuilder().withTenantId(OTHER_TENANT_ID).build());

    const page = await controller.charges({ limit: 1, offset: 1 });

    expect(page.items.map((item) => item.id)).toEqual([september.id]);
    expect(page.pagination).toEqual({ limit: 1, offset: 1, total: 2, hasMore: false });
  });

  // The page bounds are `BillingChargesQuerySchema`'s (specified in `packages/validation`); the
  // controller integration spec proves the route answers 400 for an out-of-range page.
});
