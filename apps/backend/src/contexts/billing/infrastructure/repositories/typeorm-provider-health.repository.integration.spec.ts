import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  ProviderHealthBuilder,
  ProviderHealthEntityBuilder,
} from '../../../../test/builders/billing';
import { createTestDataSource } from '../../../../test/test-datasource';
import { ProviderHealthEntity } from '../entities/provider-health.entity';
import { TypeOrmProviderHealthRepository } from './typeorm-provider-health.repository';

describe('TypeOrmProviderHealthRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmProviderHealthRepository;
  const keys: string[] = [];

  // A key no other suite or the app uses: the table has no tenant, so a row is visible to everyone.
  const newKey = (): string => {
    const key = `TEST_${uuidv7().slice(-12)}`;
    keys.push(key);
    return key;
  };

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmProviderHealthRepository(dataSource.getRepository(ProviderHealthEntity));
  });

  afterEach(async () => {
    if (keys.length > 0) {
      await dataSource.query(
        `DELETE FROM "billing"."provider_health" WHERE "merchant_profile_key" = ANY($1::text[])`,
        [keys],
      );
      keys.length = 0;
    }
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('answers null for a key with no row: not frozen, nothing to read', async () => {
    await expect(repo.findByKey(newKey())).resolves.toBeNull();
  });

  it('round-trips every column', async () => {
    const key = newKey();
    const entity = new ProviderHealthEntityBuilder()
      .withMerchantProfileKey(key)
      .withLastReconcileOkAt(new Date('2026-03-10T14:00:00Z'))
      .withLastFullReconcileAt(new Date('2026-03-10T04:00:00Z'))
      .withWebhookStatus('PAUSED')
      .withFreeze(new Date('2026-03-09T12:00:00Z'))
      .build();
    await dataSource.getRepository(ProviderHealthEntity).insert(entity);

    const health = await repo.findByKey(key);

    expect(health).toMatchObject({
      merchantProfileKey: key,
      lastReconcileOkAt: new Date('2026-03-10T14:00:00Z'),
      lastFullReconcileAt: new Date('2026-03-10T04:00:00Z'),
      webhookStatus: 'PAUSED',
      freezeActive: true,
      freezeSince: new Date('2026-03-09T12:00:00Z'),
    });
    expect(health?.updatedAt).toEqual(entity.updatedAt);
  });

  it('lists only the frozen keys', async () => {
    const frozen = newKey();
    const healthy = newKey();
    await repo.save(
      new ProviderHealthBuilder().withMerchantProfileKey(frozen).withFreeze(new Date()).build(),
    );
    await repo.save(new ProviderHealthBuilder().withMerchantProfileKey(healthy).build());

    const listed = await repo.listFrozenKeys();

    expect(listed).toContain(frozen);
    expect(listed).not.toContain(healthy);
  });

  it('save inserts a row and then updates the same one: the key is the primary key', async () => {
    const key = newKey();
    await repo.save(new ProviderHealthBuilder().withMerchantProfileKey(key).build());

    await repo.save(
      new ProviderHealthBuilder()
        .withMerchantProfileKey(key)
        .withWebhookStatus('PAUSED')
        .withFreeze(new Date('2026-03-10T12:00:00Z'))
        .build(),
    );

    const [{ count }] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM "billing"."provider_health" WHERE "merchant_profile_key" = $1`,
      [key],
    );
    expect(Number(count)).toBe(1);
    expect(await repo.findByKey(key)).toMatchObject({
      webhookStatus: 'PAUSED',
      freezeActive: true,
      freezeSince: new Date('2026-03-10T12:00:00Z'),
    });
  });

  it('a freeze can be cleared again by a later save', async () => {
    const key = newKey();
    await repo.save(
      new ProviderHealthBuilder().withMerchantProfileKey(key).withFreeze(new Date()).build(),
    );

    await repo.save(new ProviderHealthBuilder().withMerchantProfileKey(key).build());

    expect(await repo.findByKey(key)).toMatchObject({ freezeActive: false, freezeSince: null });
    expect(await repo.listFrozenKeys()).not.toContain(key);
  });
});
