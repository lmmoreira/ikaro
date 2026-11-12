import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TENANT_ACCESS_PORT, TenantAccessPort } from '../../../../shared/ports/tenant-access.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { SubscriptionEntityBuilder } from '../../../../test/builders/billing';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import {
  ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../application/ports/subscription-repository.port';
import { CreateTrialSubscriptionUseCase } from '../../application/use-cases/create-trial-subscription.use-case';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { CachingSubscriptionRepository } from './caching-subscription.repository';

describe('CachingSubscriptionRepository (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let port: TenantAccessPort;
  let repo: ISubscriptionRepository;
  let txManager: ITransactionManager;
  const tenantIds: string[] = [];

  const newTenantId = (): string => {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    return tenantId;
  };

  beforeAll(async () => {
    ({ app, ds } = await createBillingIntegrationApp());
    port = app.get<TenantAccessPort>(TENANT_ACCESS_PORT);
    repo = app.get<ISubscriptionRepository>(SUBSCRIPTION_REPOSITORY);
    txManager = app.get<ITransactionManager>(TRANSACTION_MANAGER);
  });

  afterEach(async () => {
    await ds.query(`DELETE FROM "billing"."billing_accounts" WHERE "tenant_id" = ANY($1::uuid[])`, [
      tenantIds,
    ]);
    await ds.query(
      `DELETE FROM "billing"."subscription_items" WHERE "tenant_id" = ANY($1::uuid[])`,
      [tenantIds],
    );
    await ds.query(`DELETE FROM "billing"."subscriptions" WHERE "tenant_id" = ANY($1::uuid[])`, [
      tenantIds,
    ]);
    await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, [tenantIds]);
    tenantIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers the caching decorator as the subscription repository', () => {
    expect(repo).toBeInstanceOf(CachingSubscriptionRepository);
  });

  it('serves a repeat read of the port from the cache until a save() through the repository evicts it', async () => {
    const tenantId = newTenantId();
    await ds
      .getRepository(SubscriptionEntity)
      .insert(new SubscriptionEntityBuilder().withTenantId(tenantId).withStatus('ACTIVE').build());

    const first = await port.getAccess(tenantId);
    await ds.query(
      `UPDATE "billing"."subscriptions" SET "status" = 'SUSPENDED', "suspension_reason" = 'OPERATOR', "suspended_at" = now() WHERE "tenant_id" = $1`,
      [tenantId],
    );
    const stillCached = await port.getAccess(tenantId);
    // Any writer going through the repository evicts: here a plain load-and-save in a transaction.
    await txManager.run(async () => {
      const loaded = await repo.findByTenantIdForUpdate(tenantId);
      if (!loaded) throw new Error('expected the subscription to exist');
      await repo.save(loaded);
    });
    const fresh = await port.getAccess(tenantId);

    expect(first.operational).toBe(true);
    expect(stillCached.operational).toBe(true);
    expect(fresh.operational).toBe(false);
  });

  it('never caches a missing subscription: the provisional answer ends the moment the trial exists', async () => {
    const tenantId = newTenantId();
    const slug = `s13-${uuidv7()}`;
    await ds.getRepository(TenantEntity).insert(
      new TenantEntityBuilder()
        .withId(tenantId)
        .withSlug(slug)
        .withCreatedAt(new Date(Date.now() - 60_000))
        .build(),
    );
    const provisional = await port.getAccess(tenantId);

    await app.get(CreateTrialSubscriptionUseCase, { strict: false }).execute({
      tenantId,
      slug,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      adminEmail: 'dono@lavacar.com.br',
      occurredAt: new Date().toISOString(),
      correlationId: uuidv7(),
      eventId: uuidv7(),
    });
    const real = await port.getAccess(tenantId);

    expect(provisional.provisional).toBe(true);
    expect(real.status).toBe('TRIALING');
    expect(real).not.toHaveProperty('provisional');
  });
});
