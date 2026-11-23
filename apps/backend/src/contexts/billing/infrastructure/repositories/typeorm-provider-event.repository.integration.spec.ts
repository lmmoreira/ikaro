import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { ProviderEventBuilder } from '../../../../test/builders/billing';
import { createTestDataSource } from '../../../../test/test-datasource';
import { ProviderEventEntity } from '../entities/provider-event.entity';
import {
  DELETE_OLDER_THAN_BATCH_SQL,
  TypeOrmProviderEventRepository,
} from './typeorm-provider-event.repository';

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

  describe('deleteOlderThanBatch (UC-114 retention)', () => {
    // Far in the past, so the cross-tenant delete cannot touch another suite's rows.
    const DAY_MS = 86_400_000;
    const cutoff = new Date(Date.now() - 400 * DAY_MS);
    const older = (days: number): Date => new Date(cutoff.getTime() - days * DAY_MS);

    const insert = async (receivedAt: Date, tenantId: string): Promise<string> => {
      const event = new ProviderEventBuilder()
        .withTenantId(tenantId)
        .withReceivedAt(receivedAt)
        .build();
      await repo.insertIfAbsent(event);
      return event.eventId;
    };

    it('deletes only the rows older than the cutoff, across tenants, and keeps the rest', async () => {
      const tenantA = newTenant();
      const tenantB = newTenant();
      const oldA = await insert(older(1), tenantA);
      const oldB = await insert(older(2), tenantB);
      const keptAtCutoff = await insert(cutoff, tenantA);
      const keptRecent = await insert(new Date(), tenantB);

      // A global sweep: a leftover old row from another suite may be deleted too, so a lower bound.
      expect(await repo.deleteOlderThanBatch(cutoff, 1000)).toBeGreaterThanOrEqual(2);

      expect(await rowsFor(oldA)).toHaveLength(0);
      expect(await rowsFor(oldB)).toHaveLength(0);
      expect(await rowsFor(keptAtCutoff)).toHaveLength(1);
      expect(await rowsFor(keptRecent)).toHaveLength(1);
    });

    it('deletes at most `limit` rows, the oldest first', async () => {
      const tenantId = newTenant();
      // Far older than any other fixture, so these are the oldest rows in the table.
      const oldest = await insert(older(900), tenantId);
      const middle = await insert(older(800), tenantId);
      const newest = await insert(older(700), tenantId);

      expect(await repo.deleteOlderThanBatch(cutoff, 2)).toBe(2);

      expect(await rowsFor(oldest)).toHaveLength(0);
      expect(await rowsFor(middle)).toHaveLength(0);
      expect(await rowsFor(newest)).toHaveLength(1);
    });

    it('running it again is safe: the second run deletes nothing', async () => {
      const expired = await insert(older(1), newTenant());

      expect(await repo.deleteOlderThanBatch(cutoff, 1000)).toBeGreaterThanOrEqual(1);
      expect(await rowsFor(expired)).toHaveLength(0);
      expect(await repo.deleteOlderThanBatch(cutoff, 1000)).toBe(0);
    });

    it('reads the batch through the received_at index', async () => {
      const plan = await dataSource.transaction(async (manager) => {
        await manager.query('SET LOCAL enable_seqscan = off');
        const rows = (await manager.query(`EXPLAIN ${DELETE_OLDER_THAN_BATCH_SQL}`, [
          cutoff,
          1000,
        ])) as Array<{ 'QUERY PLAN': string }>;
        return rows.map((row) => row['QUERY PLAN']).join('\n');
      });

      expect(plan).toContain('IDX_billing_provider_events_received_at');
    });
  });
});
