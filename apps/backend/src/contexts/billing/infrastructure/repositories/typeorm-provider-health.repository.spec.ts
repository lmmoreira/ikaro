import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ProviderHealthBuilder,
  ProviderHealthEntityBuilder,
} from '../../../../test/builders/billing';
import { ProviderHealthEntity } from '../entities/provider-health.entity';
import { TypeOrmProviderHealthRepository } from './typeorm-provider-health.repository';

// An insert query builder that records what it was given, so the upsert's SQL contract is pinned
// without a database (the round trip against Postgres is the integration spec's).
interface UpsertCall {
  values: unknown;
  overwritten: string[];
  conflictTarget: string[];
}

const fakeManager = (upserts: UpsertCall[] = []) => {
  const builder = {
    insert: () => builder,
    into: () => builder,
    values: (values: unknown) => {
      upserts.push({ values, overwritten: [], conflictTarget: [] });
      return builder;
    },
    orUpdate: (overwritten: string[], conflictTarget: string[]) => {
      Object.assign(upserts[upserts.length - 1], { overwritten, conflictTarget });
      return builder;
    },
    execute: jest.fn().mockResolvedValue(undefined),
  };
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: () => builder,
  } as unknown as jest.Mocked<EntityManager>;
};

describe('TypeOrmProviderHealthRepository', () => {
  let own: jest.Mocked<EntityManager>;
  let upserts: UpsertCall[];
  let repo: TypeOrmProviderHealthRepository;

  beforeEach(() => {
    upserts = [];
    own = fakeManager(upserts);
    repo = new TypeOrmProviderHealthRepository({
      manager: own,
    } as unknown as Repository<ProviderHealthEntity>);
  });

  it('maps every column of a stored row to the aggregate', async () => {
    const entity = new ProviderHealthEntityBuilder()
      .withMerchantProfileKey('BRL_ASAAS_LIVE')
      .withWebhookStatus('PAUSED')
      .withFreeze(new Date('2026-03-09T12:00:00Z'))
      .build();
    own.findOne.mockResolvedValueOnce(entity);

    const health = await repo.findByKey('BRL_ASAAS_LIVE');

    expect(health).toMatchObject({
      merchantProfileKey: 'BRL_ASAAS_LIVE',
      webhookStatus: 'PAUSED',
      freezeActive: true,
      freezeSince: new Date('2026-03-09T12:00:00Z'),
      lastReconcileOkAt: entity.lastReconcileOkAt,
      lastFullReconcileAt: entity.lastFullReconcileAt,
      updatedAt: entity.updatedAt,
    });
  });

  it('answers null for a key with no row (no row means not frozen)', async () => {
    own.findOne.mockResolvedValueOnce(null);

    await expect(repo.findByKey('NO_ROW')).resolves.toBeNull();
  });

  it('lists only the keys of frozen rows, by the freeze flag and in key order', async () => {
    own.find.mockResolvedValueOnce([
      new ProviderHealthEntityBuilder().withMerchantProfileKey('A').build(),
      new ProviderHealthEntityBuilder().withMerchantProfileKey('B').build(),
    ]);

    await expect(repo.listFrozenKeys()).resolves.toEqual(['A', 'B']);

    expect(own.find).toHaveBeenCalledWith(
      ProviderHealthEntity,
      expect.objectContaining({
        where: { freezeActive: true },
        order: { merchantProfileKey: 'ASC' },
      }),
    );
  });

  it('saves as an upsert on the key, overwriting every column but the key, with real column names', async () => {
    await repo.save(new ProviderHealthBuilder().withMerchantProfileKey('BRL_FAKE').build());

    expect(upserts).toHaveLength(1);
    expect(upserts[0].conflictTarget).toEqual(['merchant_profile_key']);
    expect(upserts[0].overwritten).toEqual([
      'last_reconcile_ok_at',
      'last_full_reconcile_at',
      'webhook_status',
      'freeze_active',
      'freeze_since',
      'updated_at',
    ]);
    expect(upserts[0].values).toMatchObject({ merchantProfileKey: 'BRL_FAKE' });
  });

  it('records a reconcile pass as a column-scoped upsert that never names the freeze or the webhook status', async () => {
    const at = new Date('2026-03-10T15:00:00Z');

    await repo.recordReconcileOk('BRL_FAKE', at, false);
    await repo.recordReconcileOk('BRL_FAKE', at, true);

    expect(upserts.map((call) => call.overwritten)).toEqual([
      ['last_reconcile_ok_at', 'updated_at'],
      ['last_reconcile_ok_at', 'last_full_reconcile_at', 'updated_at'],
    ]);
    expect(upserts.every((call) => call.conflictTarget[0] === 'merchant_profile_key')).toBe(true);
    // A new row is inserted with those columns only, so the freeze and the webhook status take the
    // table's defaults (not frozen, unknown).
    expect(Object.keys(upserts[0].values as object).sort()).toEqual([
      'lastFullReconcileAt',
      'lastReconcileOkAt',
      'merchantProfileKey',
      'updatedAt',
    ]);
    expect(upserts[0].values).toMatchObject({ lastFullReconcileAt: null, lastReconcileOkAt: at });
    expect(upserts[1].values).toMatchObject({ lastFullReconcileAt: at });
  });

  it('joins the caller’s transaction when there is one', async () => {
    const tx = fakeManager();
    tx.findOne.mockResolvedValueOnce(new ProviderHealthEntityBuilder().build());

    const health = await runWithEntityManager(tx, () => repo.findByKey('BRL_FAKE'));

    expect(health).not.toBeNull();
    expect(tx.findOne).toHaveBeenCalledTimes(1);
    expect(own.findOne).not.toHaveBeenCalled();
  });
});
