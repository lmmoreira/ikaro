import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ProviderEventBuilder } from '../../../../test/builders/billing';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { createTestDataSource } from '../../../../test/test-datasource';
import { PROVIDER_EVENT_RETENTION_DAYS } from '../../domain/billing-constants';
import { ProviderEventEntity } from '../../infrastructure/entities/provider-event.entity';
import { TypeOrmProviderEventRepository } from '../../infrastructure/repositories/typeorm-provider-event.repository';
import { PurgeProviderEventsUseCase } from './purge-provider-events.use-case';

const DAY_MS = 86_400_000;
// The purge is a cross-tenant system job, so the clock sits far in the past: the cutoff is 400
// days ago and no row another suite inserts (all received "now") can be touched.
const CLOCK_NOW = new Date(Date.now() - (400 - PROVIDER_EVENT_RETENTION_DAYS) * DAY_MS);
const CUTOFF = new Date(CLOCK_NOW.getTime() - PROVIDER_EVENT_RETENTION_DAYS * DAY_MS);

describe('PurgeProviderEventsUseCase (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmProviderEventRepository;
  let useCase: PurgeProviderEventsUseCase;
  const tenantId = uuidv7();

  const insert = async (receivedAt: Date): Promise<string> => {
    const event = new ProviderEventBuilder()
      .withTenantId(tenantId)
      .withReceivedAt(receivedAt)
      .build();
    await repo.insertIfAbsent(event);
    return event.eventId;
  };

  const count = async (eventId: string): Promise<number> => {
    const rows = (await dataSource.query(
      `SELECT 1 FROM billing.provider_events WHERE event_id = $1`,
      [eventId],
    )) as unknown[];
    return rows.length;
  };

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmProviderEventRepository(dataSource.getRepository(ProviderEventEntity));
    useCase = new PurgeProviderEventsUseCase(repo, new FixedClock(CLOCK_NOW));
  });

  afterEach(async () => {
    await dataSource.query(`DELETE FROM billing.provider_events WHERE tenant_id = $1`, [tenantId]);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('removes a row 30 days and one second old, keeps one at exactly 30 days and a newer one', async () => {
    const expired = await insert(new Date(CUTOFF.getTime() - 1000));
    const atBoundary = await insert(CUTOFF);
    const recent = await insert(new Date(CLOCK_NOW.getTime() - DAY_MS));

    const result = await useCase.execute({ correlationId: uuidv7() });

    expect(result).toEqual({ deleted: 1, batches: 1, limitHit: false });
    expect(await count(expired)).toBe(0);
    expect(await count(atBoundary)).toBe(1);
    expect(await count(recent)).toBe(1);
  });

  it('running it twice is safe: the second run deletes nothing', async () => {
    await insert(new Date(CUTOFF.getTime() - DAY_MS));

    await expect(useCase.execute({ correlationId: uuidv7() })).resolves.toMatchObject({
      deleted: 1,
    });
    await expect(useCase.execute({ correlationId: uuidv7() })).resolves.toMatchObject({
      deleted: 0,
    });
  });
});
