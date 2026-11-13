import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { SubscriptionEntityBuilder } from '../../../../test/builders/billing';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { databaseNow, waitForBlockedLock } from '../../../../test/utils/booking-lock-race-world';
import { ExemptProtectedError } from '../../domain/errors/billing-domain.error';
import { OperatorAuditEntity } from '../../infrastructure/entities/operator-audit.entity';
import { SubscriptionEntity } from '../../infrastructure/entities/subscription.entity';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../ports/subscription-repository.port';
import { SuspendTenantByOperatorUseCase } from './suspend-tenant-by-operator.use-case';

// Lock B-R1 (docs/LOCK_CATALOG.md): an operator suspend must wait for a concurrent transaction that
// already holds the subscription row, and then decide on that transaction's COMMITTED state. The
// holder makes the tenant exempt; the parked suspend must therefore be refused. Without the row
// lock the suspend reads the stale non-exempt row at once and wins, and this spec fails.
describe('SuspendTenantByOperatorUseCase (integration): lock B-R1', () => {
  let app: INestApplication;
  let ds: DataSource;
  let useCase: SuspendTenantByOperatorUseCase;
  let txManager: ITransactionManager;
  let subscriptions: ISubscriptionRepository;
  const tenantId = uuidv7();

  beforeAll(async () => {
    ({ app, ds } = await createBillingIntegrationApp());
    useCase = app.get(SuspendTenantByOperatorUseCase);
    txManager = app.get<ITransactionManager>(TRANSACTION_MANAGER);
    subscriptions = app.get<ISubscriptionRepository>(SUBSCRIPTION_REPOSITORY);
    await ds
      .getRepository(SubscriptionEntity)
      .insert(new SubscriptionEntityBuilder().withTenantId(tenantId).withStatus('ACTIVE').build());
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM "billing"."operator_audit" WHERE "tenant_id" = $1`, [tenantId]);
    await ds.query(`DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = $1`, [tenantId]);
    await ds.query(`DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = $1`, [tenantId]);
    await app.close();
  });

  it('parks behind a transaction holding the row, then sees its committed state (exempt) and is refused', async () => {
    let release!: () => void;
    let signalLocked!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const locked = new Promise<void>((resolve) => (signalLocked = resolve));

    const holder = txManager.run(async () => {
      const subscription = await subscriptions.findByTenantIdForUpdate(tenantId);
      if (subscription === null) throw new Error('seeded subscription missing');
      subscription.setExempt(new Date(), 'holder', 'corr-holder');
      await subscriptions.save(subscription);
      signalLocked();
      await gate;
    });
    await locked;

    const since = await databaseNow(ds);
    const suspend = useCase.execute({
      tenantId,
      operator: 'Ana Souza',
      reason: 'abuse report',
      correlationId: 'corr-suspend',
    });
    // The suspend is observably parked on the row lock (Postgres reports its session waiting), so
    // the release below cannot be what lets it through. Releasing in `finally` keeps a failed wait
    // from leaving the holder's lock behind for the teardown.
    try {
      await waitForBlockedLock(ds, 'row', since);
    } finally {
      release();
      await holder;
    }

    await expect(suspend).rejects.toThrow(ExemptProtectedError);
    const row = await ds.getRepository(SubscriptionEntity).findOneByOrFail({ tenantId });
    expect(row).toMatchObject({ status: 'ACTIVE', exempt: true });
    expect(await ds.getRepository(OperatorAuditEntity).countBy({ tenantId })).toBe(0);
  });
});
