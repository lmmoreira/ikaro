import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { CronRunLogEntity } from '../entities/cron-run-log.entity';
import { TypeOrmCronRunLogRepository } from './typeorm-cron-run-log.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CRON_DATE = '2026-06-01';
const REMINDER_TYPE = 'booking-reminder';

describe('TypeOrmCronRunLogRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmCronRunLogRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmCronRunLogRepository(dataSource.getRepository(CronRunLogEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.query(`DELETE FROM "booking"."cron_run_log" WHERE tenant_id = $1`, [
      TENANT_ID,
    ]);
  });

  it('hasRun returns false for a (tenant, date, reminderType) with no recorded run', async () => {
    expect(await repo.hasRun(TENANT_ID, CRON_DATE, REMINDER_TYPE)).toBe(false);
  });

  it('markRun then hasRun returns true', async () => {
    await repo.markRun(TENANT_ID, CRON_DATE, REMINDER_TYPE);
    expect(await repo.hasRun(TENANT_ID, CRON_DATE, REMINDER_TYPE)).toBe(true);
  });

  it('marking the same key twice does not throw (idempotent upsert)', async () => {
    await repo.markRun(TENANT_ID, CRON_DATE, REMINDER_TYPE);
    await expect(repo.markRun(TENANT_ID, CRON_DATE, REMINDER_TYPE)).resolves.not.toThrow();
  });

  it('is scoped independently per reminderType — marking one type does not mark another', async () => {
    await repo.markRun(TENANT_ID, CRON_DATE, REMINDER_TYPE);
    expect(await repo.hasRun(TENANT_ID, CRON_DATE, 'booking-admin-schedule-reminder')).toBe(false);
  });

  it('is scoped independently per cronDate — marking one date does not mark another', async () => {
    await repo.markRun(TENANT_ID, CRON_DATE, REMINDER_TYPE);
    expect(await repo.hasRun(TENANT_ID, '2026-06-02', REMINDER_TYPE)).toBe(false);
  });
});
