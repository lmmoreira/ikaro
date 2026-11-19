import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { ProviderEventBuilder } from '../../../../test/builders/billing';
import { createTestDataSource } from '../../../../test/test-datasource';
import { ProviderEventEntity } from '../entities/provider-event.entity';
import { TypeOrmProviderEventRepository } from './typeorm-provider-event.repository';

describe('TypeOrmProviderEventRepository (integration)', () => {
  let dataSource: DataSource;
  let txManager: TypeOrmTransactionManager;
  let repo: TypeOrmProviderEventRepository;
  const tenants: string[] = [];

  const newTenant = (): string => {
    const tenantId = uuidv7();
    tenants.push(tenantId);
    return tenantId;
  };

  const rowsFor = (eventId: string): Promise<Record<string, unknown>[]> =>
    dataSource.query(`SELECT * FROM billing.provider_events WHERE event_id = $1`, [eventId]);

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(dataSource);
    repo = new TypeOrmProviderEventRepository(dataSource.getRepository(ProviderEventEntity));
  });

  afterEach(async () => {
    if (tenants.length > 0) {
      await dataSource.query(
        `DELETE FROM billing.provider_events WHERE tenant_id = ANY($1::uuid[])`,
        [tenants],
      );
      tenants.length = 0;
    }
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('inserts a new event with its tenant, type and instants, and nothing else', async () => {
    const event = new ProviderEventBuilder()
      .withTenantId(newTenant())
      .withEventType('PaymentOverdue')
      .build();

    expect(await repo.insertIfAbsent(event)).toBe(true);

    const [row] = await rowsFor(event.eventId);
    expect(row).toMatchObject({
      provider: 'ASAAS',
      event_id: event.eventId,
      tenant_id: event.tenantId,
      event_type: 'PaymentOverdue',
    });
    expect(Object.keys(row as object).sort()).toEqual([
      'event_id',
      'event_type',
      'processed_at',
      'provider',
      'received_at',
      'tenant_id',
    ]);
  });

  it('a replayed event is a no-op that returns false and keeps the first row', async () => {
    const tenantId = newTenant();
    const first = new ProviderEventBuilder()
      .withTenantId(tenantId)
      .withEventType('PaymentConfirmed')
      .build();
    const replay = new ProviderEventBuilder()
      .withTenantId(tenantId)
      .withEventId(first.eventId)
      .withEventType('PaymentOverdue')
      .build();

    expect(await repo.insertIfAbsent(first)).toBe(true);
    expect(await repo.insertIfAbsent(replay)).toBe(false);

    const rows = await rowsFor(first.eventId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: 'PaymentConfirmed' });
  });

  it('the same event id from another provider is a different event', async () => {
    const tenantId = newTenant();
    const asaas = new ProviderEventBuilder().withTenantId(tenantId).withProvider('ASAAS').build();
    const stripe = new ProviderEventBuilder()
      .withTenantId(tenantId)
      .withProvider('STRIPE')
      .withEventId(asaas.eventId)
      .build();

    expect(await repo.insertIfAbsent(asaas)).toBe(true);
    expect(await repo.insertIfAbsent(stripe)).toBe(true);
  });

  it('a duplicate insert is a no-op under concurrency: exactly one caller inserts', async () => {
    const event = new ProviderEventBuilder().withTenantId(newTenant()).build();

    const results = await Promise.all([
      txManager.run(() => repo.insertIfAbsent(event)),
      txManager.run(() => repo.insertIfAbsent(event)),
      txManager.run(() => repo.insertIfAbsent(event)),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await rowsFor(event.eventId)).toHaveLength(1);
  });

  it('joins the caller’s transaction: a rolled-back transaction leaves no row', async () => {
    const event = new ProviderEventBuilder().withTenantId(newTenant()).build();

    await expect(
      txManager.run(async () => {
        await repo.insertIfAbsent(event);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await rowsFor(event.eventId)).toHaveLength(0);
  });

  it('exists answers true for a stored event and false for another event id or another provider', async () => {
    const event = new ProviderEventBuilder().withTenantId(newTenant()).build();
    await repo.insertIfAbsent(event);

    expect(await repo.exists('ASAAS', event.eventId)).toBe(true);
    expect(await repo.exists('ASAAS', `${event.eventId}-other`)).toBe(false);
    expect(await repo.exists('STRIPE', event.eventId)).toBe(false);
  });
});
