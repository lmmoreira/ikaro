import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { createTestDataSource } from '../../../../test/test-datasource';
import { LoyaltyEntryBuilder } from '../../../../test/builders/loyalty/index';
import { BalanceExpiryLogEntity } from '../entities/balance-expiry-log.entity';
import { LoyaltyEntryEntity } from '../entities/loyalty-entry.entity';
import { TypeOrmBalanceExpiryLogRepository } from './typeorm-balance-expiry-log.repository';
import { TypeOrmLoyaltyEntryRepository } from './typeorm-loyalty-entry.repository';

const EXPIRY_LOG_TEST_TENANT = '00000000-0000-7000-8000-000000000001';

describe('TypeOrmBalanceExpiryLogRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmBalanceExpiryLogRepository;
  let entryRepo: TypeOrmLoyaltyEntryRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmBalanceExpiryLogRepository(dataSource.getRepository(BalanceExpiryLogEntity));
    entryRepo = new TypeOrmLoyaltyEntryRepository(dataSource.getRepository(LoyaltyEntryEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.query(
      `DELETE FROM "loyalty"."balance_expiry_log" WHERE entry_id IN (SELECT id FROM "loyalty"."loyalty_entries" WHERE tenant_id = $1)`,
      [EXPIRY_LOG_TEST_TENANT],
    );
    await dataSource.query(`DELETE FROM "loyalty"."loyalty_entries" WHERE tenant_id = $1`, [
      EXPIRY_LOG_TEST_TENANT,
    ]);
  });

  it('findProcessedEntryIds does not report an unknown entryId', async () => {
    expect(await repo.findProcessedEntryIds([uuidv7()])).toEqual(new Set());
  });

  it('markProcessedMany marks every given entry in one call', async () => {
    const first = new LoyaltyEntryBuilder().build();
    const second = new LoyaltyEntryBuilder().build();
    const untouched = new LoyaltyEntryBuilder().build();
    for (const entry of [first, second, untouched]) await entryRepo.save(entry);

    await repo.markProcessedMany([first.id, second.id]);

    expect(await repo.findProcessedEntryIds([first.id, second.id, untouched.id])).toEqual(
      new Set([first.id, second.id]),
    );
  });

  it('markProcessedMany with no ids writes nothing and does not throw', async () => {
    await expect(repo.markProcessedMany([])).resolves.toBeUndefined();
  });

  it('marking the same entries twice does not throw and keeps the original processed_at', async () => {
    const entry = new LoyaltyEntryBuilder().build();
    await entryRepo.save(entry);
    await repo.markProcessedMany([entry.id]);
    const [{ processed_at: first }] = await dataSource.query<{ processed_at: Date }[]>(
      `SELECT processed_at FROM "loyalty"."balance_expiry_log" WHERE entry_id = $1`,
      [entry.id],
    );

    await expect(repo.markProcessedMany([entry.id])).resolves.toBeUndefined();

    const [{ processed_at: second }] = await dataSource.query<{ processed_at: Date }[]>(
      `SELECT processed_at FROM "loyalty"."balance_expiry_log" WHERE entry_id = $1`,
      [entry.id],
    );
    expect(second).toEqual(first);
  });
});
