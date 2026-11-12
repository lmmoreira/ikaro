import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { SubscriptionEntityBuilder } from '../../../../test/builders/billing';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { OperatorAuditEntity } from '../../infrastructure/entities/operator-audit.entity';
import { SubscriptionEntity } from '../../infrastructure/entities/subscription.entity';
import { OPERATOR_AUDIT_REPOSITORY } from '../ports/operator-audit-repository.port';
import { SuspendTenantByOperatorUseCase } from './suspend-tenant-by-operator.use-case';

// The audit row is the last write of the transaction: when it fails, the subscription change and
// the outbox row must leave nothing behind (all-or-nothing, M25-S15b).
describe('SuspendTenantByOperatorUseCase (integration): one transaction', () => {
  let app: INestApplication;
  let ds: DataSource;
  let eventBus: RoutingInMemoryEventBus;
  let useCase: SuspendTenantByOperatorUseCase;
  const tenantId = uuidv7();

  beforeAll(async () => {
    ({ app, ds, eventBus } = await createBillingIntegrationApp({
      overrideProviders: [
        {
          provide: OPERATOR_AUDIT_REPOSITORY,
          useValue: {
            save: async () => {
              throw new Error('audit write failed');
            },
            findByIdAndTenant: async () => null,
          },
        },
      ],
    }));
    useCase = app.get(SuspendTenantByOperatorUseCase);
    await ds
      .getRepository(SubscriptionEntity)
      .insert(new SubscriptionEntityBuilder().withTenantId(tenantId).withStatus('ACTIVE').build());
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = $1`, [tenantId]);
    await app.close();
  });

  it('rolls back the subscription change and publishes nothing when the audit write fails', async () => {
    await expect(
      useCase.execute({ tenantId, operator: 'Ana Souza', reason: 'abuse report' }),
    ).rejects.toThrow('audit write failed');

    const row = await ds.getRepository(SubscriptionEntity).findOneByOrFail({ tenantId });
    expect(row).toMatchObject({ status: 'ACTIVE', suspensionReason: null, version: 0 });
    expect(await ds.getRepository(OperatorAuditEntity).countBy({ tenantId })).toBe(0);
    expect(eventBus.published).toHaveLength(0);
  });
});
