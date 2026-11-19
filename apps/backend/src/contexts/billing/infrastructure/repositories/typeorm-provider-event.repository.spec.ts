import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ProviderEventBuilder } from '../../../../test/builders/billing';
import { ProviderEventEntity } from '../entities/provider-event.entity';
import { TypeOrmProviderEventRepository } from './typeorm-provider-event.repository';

const fakeManager = (): jest.Mocked<EntityManager> =>
  ({ query: jest.fn() }) as unknown as jest.Mocked<EntityManager>;

describe('TypeOrmProviderEventRepository', () => {
  let own: jest.Mocked<EntityManager>;
  let repo: TypeOrmProviderEventRepository;

  beforeEach(() => {
    own = fakeManager();
    repo = new TypeOrmProviderEventRepository({
      manager: own,
    } as unknown as Repository<ProviderEventEntity>);
  });

  it.each([
    ['plain rows', [{ event_id: 'evt_1' }]],
    ['the [rows, rowCount] shape', [[{ event_id: 'evt_1' }], 1]],
  ])('returns true when the row was inserted (%s)', async (_n, result) => {
    own.query.mockResolvedValueOnce(result);

    expect(await repo.insertIfAbsent(new ProviderEventBuilder().build())).toBe(true);
  });

  it('returns false for a duplicate: ON CONFLICT DO NOTHING returns no row', async () => {
    own.query.mockResolvedValueOnce([]);

    expect(await repo.insertIfAbsent(new ProviderEventBuilder().build())).toBe(false);
  });

  it('writes the key, the tenant, the type and the two instants — and no payload', async () => {
    own.query.mockResolvedValueOnce([]);
    const event = new ProviderEventBuilder().withEventType('PaymentOverdue').build();

    await repo.insertIfAbsent(event);

    const [sql, params] = own.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT ("provider", "event_id") DO NOTHING');
    expect(sql).not.toMatch(/payload|body/i);
    expect(params).toEqual([
      event.provider,
      event.eventId,
      event.tenantId,
      'PaymentOverdue',
      event.receivedAt,
      event.processedAt,
    ]);
  });

  it('joins the caller’s transaction so the row commits with the local change', async () => {
    const tx = fakeManager();
    tx.query.mockResolvedValueOnce([{ event_id: 'evt_1' }]);

    const inserted = await runWithEntityManager(tx, () =>
      repo.insertIfAbsent(new ProviderEventBuilder().build()),
    );

    expect(inserted).toBe(true);
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(own.query).not.toHaveBeenCalled();
  });
});
